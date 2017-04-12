DBG_MODE=true
var util = require('util');
var fs = require( 'fs' );
var EventEmitter = require('events');
var bitcore = require('bitcore-lib');
var explorers = require('bitcore-explorers');

// var Service = require('bitcore-node').Service;
var BMNode = require('./BMNode');
const BMNet = require('./BMNet');
var BMutils = require('./BMutils');

var tBTC = bitcore.Networks.testnet
var insight = new explorers.Insight(tBTC);
var MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT

/* Set Data directory */
var dataDir = __dirname+'/data'
if(!fs.existsSync(dataDir)){
  fs.mkdirSync(dataDir);
}


/* HELPER FUNCTIONS */
/********************************************************************/
var log = BMutils.log
var hexToAscii = BMutils.hexToAscii

/* Read a node file from disk */
function readBMNodeFile(name){
  path = dataDir //"./nodes/"
  var file = fs.readFileSync(path+name+".dat");
  var nodeData = JSON.parse(file);

  return nodeData
}

/* Split message 'str' in chunks of 'size' letters */
function chunkMessage(str, size) {
  var numChunks = Math.ceil(str.length / size),
      chunks = new Array(numChunks);

  for(var i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size);
  }

  return chunks;
}

/* Put chunks together */
function assembleMessage(msgArray){
  var fullmsg = ""
  for(i=0;i<msgArray.length;i++){
      fullmsg += msgArray[i]
  }

  return fullmsg
}

/********************************************************************/

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
    this.messageStorage = {}
  }

  this.on('error', function(err) {
    log(err.stack);
  });
}

/* We need bitcoind to listen for new transactions */ //TODO: update?
BitMExService.dependencies = ['bitcoind'];

/* inherits the service base class */
util.inherits(BitMExService, EventEmitter);

/* loadNode: add a node to the pool */
BitMExService.prototype.loadNode = function(bmnode){
  var self = this
  var BMNodes = self.bmnodes

  var addr = (self.node.network == tBTC ? bmnode.tstAddr : bmnode.liveAddr)
  BMNodes[addr] = {}
  BMNodes[addr].name = bmnode.name

  var params = {node:self.node, id:bmnode.name, addr: addr, bus: self.bus}
  BMNodes[addr].bmnode = new BMNode(params, bmnode.privKey)

  if(DBG_MODE){
    console.log("[BM] Added node: "+bmnode.name );
    log("BMNodes: "+ BMNodes)
  }
}

/* Read node files and load their addresses */
//TODO: put everything in one file?
BitMExService.prototype.loadNet = function(){
  var self = this
  self.bmnet = new BMNet({node: self.node, bus: self.bus, name:"testbmnet"}, dataDir)
  self.bmnodes = {};

  // files = fs.readdirSync(dataDir)
  // files.forEach(function(file){
  //   var fileData = fs.readFileSync(dataDir+'/'+file);
  //   var nodeData = JSON.parse(fileData);
/*
    var addr = (self.node.network == tBTC ? nodeData.tstAddr : nodeData.liveAddr)
    nodes[addr] = {}
    nodes[addr].name = nodeData.name

    var params = {id:nodeData.name, node:self.node, addr: addr, bus: self.bus}
    nodes[addr].bmnode = new BMNode(params, nodeData.privKey)
*/
  //  self.loadNode(nodeData)
  // });
}


/* Start service */
BitMExService.prototype.start = function(callback) {
  this.node.services.bitcoind.on('tx', this.transactionHandler.bind(this));
  this.bus = this.node.openBus()
  this.bus.subscribe('bmservice/newmessage');
  this.bus.subscribe('bmservice/broadcast');

  this.loadNet()

  this.emit('ready');
  callback();
};

/* stop */
BitMExService.prototype.stop = function(callback) {
  //TODO: clean something?
  callback();
};

BitMExService.prototype.tryapi = function(a,callback){
  self = this
  console.log("a:"+a);
  // log("bmnodes"+self.bmnodes)
  for (i in self.bmnodes) {
    log("Name: " + i + " Value: " + self.bmnodes[i]);
  }
  log("tryapi")
  return callback(null,"OK2");
}
/* Set API endpoints */
BitMExService.prototype.getAPIMethods = function() {
  // var self = this
  return methods = [
    ['tryapi', this, this.tryapi, 1],
    ['sendmessage', this, this.sendMessage, 3],
    ['getmessages', this, this.getMessages, 2]
  ];
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

BitMExService.prototype.getAddr = function(name){
  var bmnodes = this.bmnodes

  for(var key in bmnodes)
    if(bmnodes[key].name == name)
      return key;

  return null;
};

//TODO: handle multiple messages from same A to same B
BitMExService.prototype.sendMessage = function(source, dest, message, callback){
  log("sending \'"+message+"\' from "+source+" to "+dest);
  var self = this
  var srcAddr = self.getAddr(source);//nodeData.tstAddr
  var dstAddr = self.getAddr(dest);//nodeData.tstAddr

  /* Split message in chunks */
  var chunks = chunkMessage(message, 76)

  /* Function to send a transaction with an embedde message chunk */
  var sendMsgTransaction = function(seq){
    /* Get UTXOs to fund new transaction */
    insight.getUnspentUtxos(srcAddr, function(err, utxos){
      if(err) return log(BMlog+'ERR (insight.getUnspentUtxos):'+err);
      if(utxos.length == 0) return log(BMlog+'ERR: Not enough Satoshis to make transaction');
      //TODO: get new coins from faucet

      seqcode = seq.toString(16)
      len = chunks.length.toString(16)
      var prefix = "BM" + len + seqcode

      /* Create Transaction */
      //TODO: put this in try/catch block
      var transaction = new bitcore.Transaction()
      .from(utxos)
      .to(dstAddr, MIN_AMOUNT)
      .change(srcAddr)
      .addData(prefix+chunks[seq])

      // Set estimate fee (not based on priority) -> check returned value
      transaction.fee(transaction.getFee())

      /* Let the node sign the transaction */
      if(self.bmnodes)
        self.bmnodes[srcAddr.toString()].bmnode.signMessage(transaction)

      //TODO: verify serialization errors (see at the end of this file)

      /* Broadcast Transaction */
      insight.broadcast(transaction, function (err, txid) {
        if (err) return log('ERR (insight.broadcast): ' + err);

        log('Sent chunk:'+chunks[seq]+". Tx: " + txid);

        if(seq == chunks.length-1){
          // log("All chunks sent");
          if(callback)
            return callback()
        }
        else sendMsgTransaction(seq+1)
      });
    })//getUnspentUtxos
  }//sendMsgTransaction

  /* Check if there is enough funds to send the whole message */
  insight.getUnspentUtxos(srcAddr, function(err, utxos){
    if(err) return log("ERR: "+err);

    var balance = 0
    for (var i = 0; i < utxos.length; i++)
      balance +=utxos[i]['satoshis'];
    if(balance < (2*MIN_AMOUNT*chunks.length))
      return callback("ERR: not enough funds to send message");

    sendMsgTransaction(0)
    return callback(null, "Message sent")
  });
}

/* Emits 'newmessage' event notifications to BM Nodes*/
BitMExService.prototype.deliverMessage = function(src, dst, msg){
  var srcNode = this.bmnodes[src.toString()].name
  var dstNode = this.bmnodes[dst.toString()].name
  var params = {src:srcNode, dst:dstNode, msg:msg}

  for(var i = 0; i < this.subscriptions.newmessage.length; i++) {
    this.subscriptions.newmessage[i].emit('bmservice/newmessage', params);
  }
}

/* Collects received chunks */
BitMExService.prototype.collectMessage = function (src, dst, data){
  var msglen = parseInt(data.charAt(3), 16);
  var msgseq = parseInt(data.charAt(4), 16);
  var msg = data.slice(5)

  /* Add cunk to temporary storage */
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

/* Check if 'tx' contains an BM protocol message */
function isBMTransaction(tx){
  if(tx.outputs.length < 2) return false

  script = tx.outputs[1].script
  if(!script.isDataOut()) return false

  msgsplit = script.toString().split(" ")
  msgcode = msgsplit[msgsplit.length-1]
  data = hexToAscii(msgcode)

  BMcode = data.substring(0,3)
  if(BMcode.localeCompare("BM")!=0) return false

  return true
}

/* transactionHandler */
BitMExService.prototype.transactionHandler = function(txBuffer) {
  var self = this;
  var tx = bitcore.Transaction().fromBuffer(txBuffer);

  //log('tx: '+tx.id);
  if(tx.inputs[0] && tx.inputs[0].script && tx.outputs[0] && tx.outputs[0].script){
    if(isBMTransaction(tx)){
      var src = tx.inputs[0].script.toAddress(this.node.network);
      var dst = tx.outputs[0].script.toAddress(this.node.network);

      var msgsplit = tx.outputs[1].script.toString().split(" ")
      var data = hexToAscii(msgsplit[msgsplit.length-1])

      this.collectMessage(src, dst, data)
    }
  }//if
};

BitMExService.prototype.setupRoutes = function(app, express) {
  var self = this
  // Set up routes
  app.get('/hello', function(req, res) {
    log('GET Hello');
    res.send('world');

    for (var i = 0; i < self.subscriptions.broadcast.length; i++) {
      self.subscriptions.broadcast[i].emit('bmservice/broadcast', 'hello world');
    }
  });

  // Serve static content
  app.use('/static', express.static(__dirname + '/static'));
};

BitMExService.prototype.getRoutePrefix = function() {
  return 'bmservice'
};

module.exports = BitMExService;
module.exports.sendMessage = this.sendMessage //TODO: remove (replaced by APIcalls)
