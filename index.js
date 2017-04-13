var util = require('util');
var fs = require( 'fs' );
var EventEmitter = require('events');
var bitcore = require('bitcore-lib');
var explorers = require('bitcore-explorers');

// var Service = require('bitcore-node').Service;
const TX_PREFIX = "BM"
const BMNode = require('./BMNode');
const BMNet = require('./BMNet');
const BMutils = require('./BMutils');
const BTC = BMutils.BTC

const DBG = BMutils.DBG

const MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT

/* Set Data directory */
var dataDir = __dirname+'/data'
if(!fs.existsSync(dataDir)){
  fs.mkdirSync(dataDir);
}

const hexToAscii = BMutils.hexToAscii

/* BM Service Class */
/********************************************************************/
/* Constructor */
function BitMExService(options){
  if(options){
    EventEmitter.call(this, options);
    this.node = options.node;

    this.subscriptions = {};
    this.subscriptions.newmessage = [];
    this.subscriptions.broadcast = [];
    this.messageStorage = {} //TODO: change name?

    this.insight = new explorers.Insight(this.node.network);
  }

  this.on('error', function(err) {
    this.log(err.stack);
  });
}
/* inherits the service base class */
util.inherits(BitMExService, EventEmitter);

/* Required services */
BitMExService.dependencies = ['bitcoind'];

/* Start service */
BitMExService.prototype.start = function(callback) {
  this.node.services.bitcoind.on('tx', this.transactionHandler.bind(this));
  this.bus = this.node.openBus()
  this.bus.subscribe('bmservice/newmessage');
  this.bus.subscribe('bmservice/broadcast');

  try {
    this.loadNet("testbmnet") //TODO: make net name dynamic for multi net
  } catch (e) {
    return this.log("ERR: Failed to start. RET:"+e);
  }

  this.emit('ready'); //TODO: necessary?
  callback();
};

/* stop */
BitMExService.prototype.stop = function(callback) {
  //TODO: clean something?
  callback();
};

/* Set service events */
BitMExService.prototype.getPublishEvents = function() {
  return [
      {
        name: 'bmservice/newmessage',
        scope: this,
        subscribe: this.subscribe.bind(this, 'newmessage'),
        unsubscribe: this.unsubscribe.bind(this, 'newmessage')
      },
      {
        name: 'bmservice/broadcast',
        scope: this,
        subscribe: this.subscribe.bind(this, 'broadcast'),
        unsubscribe: this.unsubscribe.bind(this, 'broadcast')
      }
  ];
};

BitMExService.prototype.subscribe = function(name, emitter) {
  this.subscriptions[name].push(emitter);
};

BitMExService.prototype.unsubscribe = function(name, emitter) {
  var index = this.subscriptions[name].indexOf(emitter);
  if (index > -1) {
    this.subscriptions[name].splice(index, 1);
  }
};

/* __________ BM NETWORK FUNCTIONS  __________ */
/* Loads an existing network of nodes from file */
BitMExService.prototype.loadNet = function(name){
  //TODO: name must correspond to a file
  this.bmnet = new BMNet({node: this.node, bus: this.bus, name}, dataDir)
}

/* [API] Adds a new node to a BM network. Requires PrivateKey */
BitMExService.prototype.addNode = function(id, privKey, callback){
  if(!id) throw "ERR (addnode): Missing ID"

  try {
    this.bmnet.addBMNode({id, privKey}, true)
  } catch (e) {
    return callback(e)
  }

  return callback(null, "Node added")
}

/* [API] Creates a new node */
BitMExService.prototype.createNode = function(id, callback){
  if(DBG) this.log("Creating new node")
  if(!id) throw "ERR (addnode): Missing ID"

  try {
    this.bmnet.addBMNode({id}, true)
  } catch (e){ return callback(e) }

  return callback(null, "Node created")
}

/* [API] Deletes a node */ //TODO

/*__________ SENDER FUNCTIONS __________*/
/* Split message 'str' in chunks of 'size' letters */
function chunkMessage(str, size) {
  var numChunks = Math.ceil(str.length / size),
      chunks = new Array(numChunks);

  for(var i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size);
  }

  return chunks;
}

/* [API] Send a message */
BitMExService.prototype.sendMessage = function(src, dst, message, callback){
  if(DBG) this.log("sending \'"+message+"\' from "+src+" to "+dst);

  try {
    var srcAddr = this.bmnet.getNodeAddress(src);
    var dstAddr = this.bmnet.getNodeAddress(dst);
  } catch (e){ return callback(e) }

  /* Split message in chunks */
  var chunks = chunkMessage(message, 76)

  /* Function to send a transaction with an embedde message chunk */
  var self = this
  var sendMsgTransaction = function(seq){
    /* Get UTXOs to fund new transaction */
    this.insight.getUnspentUtxos(srcAddr, function(err, utxos){
      if(err) return callback("[insight.getUnspentUtxos]: "+err);
      if(utxos.length == 0){
        if(this.node.network == BTC)
          return callback("[BM] ERR: Not enough Satoshis to make transaction");
        else{
          //TODO: get new coins from faucet
          return callback("[BM] ERR: Not enough Satoshis to make transaction");
          ;
        }
      }

      /* Set prefix */
      seqcode = seq.toString(16)
      len = chunks.length.toString(16)
      var prefix = TX_PREFIX + len + seqcode

      /* Create Transaction */
      try {
        var tx = new bitcore.Transaction()
        .from(utxos)
        .to(dstAddr, MIN_AMOUNT)
        .change(srcAddr)
        .addData(prefix+chunks[seq])
      } catch (e){ return callback(e) }


      /* Set estimate fee (not based on priority) -> check returned value */
      tx.fee(tx.getFee())

      /* Let the node sign the transaction */
      try{
        this.bmnet.getNode(src).signTransaction(tx)
      } catch(e){ return callback(e) }

      //TODO: verify serialization errors (see at the end of this file)

      /* Broadcast Transaction */
      this.insight.broadcast(tx, function (err, txid) {
        if(err) return callback('[insight.broadcast]: '+err);

        if(DBG) this.log('Sent chunk:'+chunks[seq]+". Tx: " + txid);

        /* Iterate on chunks */
        if(seq == chunks.length-1){
          return callback("Message Sent!")
        }
        else /* Send next chunk */
          sendMsgTransaction(seq+1)
      });
    })//getUnspentUtxos
  }//sendMsgTransaction

  /* Check if there is enough funds to send the whole message */
  this.insight.getUnspentUtxos(srcAddr, function(err, utxos){
    if(err) return callback("[insight.getUnspentUtxos]: "+err);

    var balance = 0
    for (var i = 0; i < utxos.length; i++)
      balance +=utxos[i]['satoshis'];
    if(balance < (2*MIN_AMOUNT*chunks.length))
      return callback("[BM]: not enough funds to send message");

    sendMsgTransaction(0)
    return callback(null, "Message sent")
  });
}

/*__________ RECEIVER FUNCTIONS __________*/
/* Put chunks together */
function assembleMessage(msgArray){
  var fullmsg = ""
  for(i=0;i<msgArray.length;i++){
      fullmsg += msgArray[i]
  }

  return fullmsg
}

/* Emits 'newmessage' event notifications to BM Nodes */
//TODO: replace with this.bmnet.getNode().receiveMessage(msg)
BitMExService.prototype.deliverMessage = function(src, dst, msg){
  var srcNode = this.bmnet.getNodeID(src.toString()) // bmnodes[src.toString()].name
  var dstNode = this.bmnet.getNodeID(dst.toString())
  var params = {src:srcNode, dst:dstNode, msg:msg}

  for(var i = 0; i < this.subscriptions.newmessage.length; i++) {
    this.subscriptions.newmessage[i].emit('bmservice/newmessage', params);
  }
}

/* Collects received chunks */
//TODO: handle multiple messages from A to B. Add Msg ID?
BitMExService.prototype.collectMessage = function (src, dst, data){
  var msglen = parseInt(data.charAt(3), 16);
  var msgseq = parseInt(data.charAt(4), 16);
  var msg = data.slice(5)

  /* Add chunk to temporary storage */
  var msgDB = this.messageStorage
  if(!msgDB[src+dst])
    msgDB[src+dst] = []
  msgDB[src+dst][msgseq] = msg

  /* If a message is complete, deliver it */
  if(Object.keys(msgDB[src+dst]).length == msglen){
    fullmsg = assembleMessage(msgDB[src+dst])
    if(this.bmnodes[dst.toString()]){
      this.deliverMessage(src, dst, fullmsg)
      msgDB[src+dst] = []
    }
  }
}

/* Check 'tx' for BM messages */
BitMExService.prototype.isBMTransaction = function(tx){
  if(tx.outputs.length < 2) return false

  /* Get script for the 2nd output */
  var script = tx.outputs[1].script
  if(!script.isDataOut()) return false

  /* Decode */
  var msgsplit = script.toString().split(" ")
  var msgcode = msgsplit[msgsplit.length-1]
  var data = hexToAscii(msgcode)

  /* Verify BM prefix */
  var BMcode = data.substring(0,3)
  if(BMcode.localeCompare(TX_PREFIX)!=0) return false

  return true
}//isBMTransaction()

/* Handles received transactions */
BitMExService.prototype.transactionHandler = function(txBuffer) {
  var tx = bitcore.Transaction().fromBuffer(txBuffer);

  if(tx.inputs[0] && tx.inputs[0].script && tx.outputs[0] && tx.outputs[0].script){
    if(this.isBMTransaction(tx)){
      if(DBG) this.log('New BM transaction. tx: '+tx.id);
      var srcAddr = tx.inputs[0].script.toAddress(this.node.network);
      var dstAddr = tx.outputs[0].script.toAddress(this.node.network);

      var msgsplit = tx.outputs[1].script.toString().split(" ")
      var data = hexToAscii(msgsplit[msgsplit.length-1])

      this.collectMessage(srcAddr, dstAddr, data)
    }//if
  }//if
}//transactionHandler()

/*__________ WEB INTERFACE __________*/
/* Set server at http://localhost:3001/bitmex/ */
BitMExService.prototype.getRoutePrefix = function() {
  return 'bitmex'
};

/* Web Endpoints */
BitMExService.prototype.setupRoutes = function(app, express) {
  var self = this
  //TODO: TMP remove
  app.get('/hello', function(req, res) {
    self.log('GET Hello');
    res.send('world');
  });

  app.get('/broadcast', function(req, res) {
    self.log('[Web] broadcast request received');
    //TODO: handle 'req'
    res.send('Broadcasting message \'hello world\'');

    for (var i = 0; i < self.subscriptions.broadcast.length; i++) {
      self.subscriptions.broadcast[i].emit('bmservice/broadcast', 'hello world');
    }
  });

  // Serve static content
  app.use('/static', express.static(__dirname + '/static'));
  //TODO: status
};



/* Set API endpoints */
BitMExService.prototype.getAPIMethods = function() {
  // var self = this
  return methods = [
    ['tryapi', this, this.tryapi, 1],
    ['addnode', this, this.addNode, 2],
    ['createnode', this, this.createNode, 1],
    ['removenode', this, this.createNode, 1],
    ['sendmessage', this, this.sendMessage, 3],
    ['getmessages', this, this.getMessages, 2],
  ];
};

/*__________ LOG __________*/
BitMExService.prototype.log = function(msg){
  return BMutils.log('BM', msg)
}

/*__________ EXPORT __________*/
module.exports = BitMExService;
module.exports.sendMessage = this.sendMessage //TODO: remove (replaced by APIcalls)
