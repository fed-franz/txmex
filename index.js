var util = require('util');
var fs = require( 'fs' );
var EventEmitter = require('events');
var bitcore = require('bitcore-lib');
var explorers = require('bitcore-explorers');

// var Service = require('bitcore-node').Service;
const TX_PREFIX = "BM"
const BM = require('./BitMEx')
const BMNet = require('./BMNet');
const BMutils = require('./BMutils');
const BTC = BMutils.BTC
const MODE = BMutils.MODE
const DBG = BMutils.DBG

const MAX_PAYLOAD_SIZE = 76
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
  }

  this.on('error', function(err) {
    this.log(err.stack);
  });
}
/* inherits the service base class */
util.inherits(BitMExService, EventEmitter);

/* Required services */
BitMExService.dependencies = ['bitcoind','web','insight-api'];

/* Start service */
BitMExService.prototype.start = function(callback) {
  this.insight = new explorers.Insight(this.node.network);
  this.node.services.bitcoind.on('tx', this.transactionHandler.bind(this));
  this.bus = this.node.openBus()
  this.bus.subscribe('bmservice/newmessage');
  this.bus.subscribe('bmservice/broadcast');

  try {
    this.loadNet("tstBMnet") //TODO: make net name dynamic for multi net
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
BitMExService.prototype.isValidAddr = function(addr){
  return bitcore.Address.isValid(addr, this.node.network)
}

/* Loads an existing network of nodes from file */
BitMExService.prototype.loadNet = function(name){
  try{
    this.bmnet = new BMNet(this, name, dataDir)
  }catch(e){this.log(e)}
}

/* [API] Adds a new node to a BM network. Requires PrivateKey */
BitMExService.prototype.addNode = function(id, privKey, callback){
  if(!id) callback("ERR (addnode): Missing ID")

  try {
    this.bmnet.addBMNode({id, privKey}, MODE.NEW)
  } catch (e) {
    return callback(e)
  }

  return callback(null, "Node added")
}

/* [API] Creates a new node */
BitMExService.prototype.createNode = function(id, callback){
  if(!id) callback("ERR: Missing ID")
  if(DBG) this.log("Creating new node")

  try {
    var nodeID = this.bmnet.addBMNode({id}, MODE.NEW)
  } catch (e){ return callback(e) }

  return callback(null, "Node "+nodeID+" created")
}

/* [API] Deletes a node */
BitMExService.prototype.removeNode = function(id, callback){
  if(!id || !this.bmnet.isBMNodeID(id)) callback("ERR: Invalid ID")
  if(DBG) this.log("Removing node "+id)

  try {
    this.bmnet.removeBMNode(id)
  } catch (e){ return callback(e) }

  return callback(null, "Node "+id+" removed")
}

/* [API] Print the status of a node */
BitMExService.prototype.getNodeStatus = function(id, callback){
  try {
    var node = this.bmnet.getNode(id)
    if(!node) return callback(null, "Wrong node ID")
    return node.getStatus(callback)
  } catch (e) { return callback(e) }
}

/* [API] Print the status of a node */
BitMExService.prototype.getNodeMessages = function(id, callback){
  var nodeAddr = this.bmnet.getNodeAddress(id)

  var msgs = []
  try{
    self = this
    this.node.getAddressHistory(nodeAddr, {queryMempool: true}, function(err, res){
      if(err) return callback(null, e)
      var txs = res.items

      var chnkBuf = {}
      for(var i=0; i<txs.length; i++){

        var tx = bitcore.Transaction().fromObject(txs[i].tx);
        var srcAddr = tx.inputs[0].script.toAddress(self.node.network);

        var txMsg = BM.getMessage(tx)
        if(txMsg){
          if(!chnkBuf[srcAddr]) chnkBuf[srcAddr] = new Array(txMsg.len)

          chnkBuf[srcAddr][txMsg.seq] = {msg:txMsg.msg, txid:tx.hash}
          /*Check if we have all chunks*/
          var complete = true
          for(var j=0; j<txMsg.len; j++)
            if(!chnkBuf[srcAddr][j]) complete = false;

          if(complete){
            var msg = ""
            var msgtxs = []
            for(var j=0; j<txMsg.len; j++){

              msg += chnkBuf[srcAddr][j].msg
              msgtxs.push(chnkBuf[srcAddr][j].txid)
            }

            var src = self.bmnet.isBMNodeAddr(srcAddr) ? self.bmnet.getNodeID(srcAddr) : srcAddr
            msgs.push({'txs':msgtxs, 'src':src, 'data':msg}); //TODO: add timestamp/height

            delete chnkBuf[srcAddr]
          }//if(complete)
        }//if(txMsg)
      }

      return callback(null, msgs)
    })
  }
  catch(e){return callback(null, e)}
}

/*__________ SENDER FUNCTIONS __________*/
/* [API] Send a message */
BitMExService.prototype.sendMessage = function(src, dst, msg, callback){
  if(DBG) this.log("sending \'"+msg+"\' from "+src+" to "+dst);

  /* Check src and dst */
  var srcAddr = this.bmnet.getNodeAddress(src)
  if(!srcAddr) return callback(null, "ERR: invalid source")
  var dstAddr = this.bmnet.getNodeAddress(dst)
  if(!dstAddr)
    if(this.isValidAddr(dst))
      dstAddr = dst
    else return callback(null, "ERR: invalid destination")


  /* Split message in chunks */
  var chunks = BMutils.chunkMessage(msg, MAX_PAYLOAD_SIZE)

  /* Function to send a transaction with an embedde message chunk */
  var self = this
  var senttxs = []
  var sendMsgTransaction = function(seq, cb){
    /* Get UTXOs to fund new transaction */
    self.insight.getUnspentUtxos(srcAddr, function(err, utxos){
      if(err) return cb("[insight.getUnspentUtxos]: "+err);
      if(utxos.length == 0){
        if(self.node.network == BTC)
          return cb("ERR: Not enough Satoshis to make transaction");
        else{
          //TODO: get new coins from faucet AND RETRY
          return cb("ERR: Not enough Satoshis to make transaction");
        }
      }

      /* Set the prefix */
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
      } catch (e){ return cb(e) }

      /* Set estimate fee (not based on priority) -> check returned value */
      tx.fee(tx.getFee())

      /* Let the node sign the transaction */
      try{
        self.bmnet.getNode(src).signTransaction(tx)
      } catch(e){ return cb(e) }

      //TODO: verify serialization errors (see at the end of this file)

      /* Broadcast Transaction */
      self.insight.broadcast(tx, function(err, txid) {
        if(err) return cb('[insight.broadcast]: '+err);

        if(DBG) self.log("Chunk "+seq+" sent. [Tx: " + txid+"]");
        senttxs.push({seq:seq,txid:txid})

        /* Iterate on chunks */
        if(seq == chunks.length-1){
          return cb(null, senttxs)
        }
        else /* Send next chunk */
          setTimeout(sendMsgTransaction(seq+1, cb), 1000)
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

    try{
      sendMsgTransaction(0, function(err, res){
        if(err) callback(null, err)
        return callback(null, res)
      })
    }catch(e){return callback(e)}
    //"Message sent ("+chunks.length+" chunks)")
  });
}

/*__________ RECEIVER FUNCTIONS __________*/
/* Emits 'newmessage' event notifications to BM Nodes */
//TODO: replace with this.bmnet.getNode().receiveMessage(msg) ?
BitMExService.prototype.deliverMessage = function(src, dst, data){
  var srcNode = this.bmnet.getNodeID(src.toString())
  if(!srcNode) srcNode = dst.toString()
  var dstNode = this.bmnet.getNodeID(dst.toString())
  var message = {src:srcNode, dst:dstNode, data:data}

  for(var i = 0; i < this.subscriptions.newmessage.length; i++)
    this.subscriptions.newmessage[i].emit('bmservice/newmessage', message);
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
    var fullmsg = BMutils.assembleChunks(msgDB[src+dst])
    if(this.bmnet.getNodeID(dst.toString())){
      this.deliverMessage(src, dst, fullmsg)
      msgDB[src+dst] = []
    }
    else throw "ERR: destination "+dst.toString()+"is unreachable"
  }
}

/* Check 'tx' for BM messages */
BitMExService.prototype.isBMTransaction = function(tx){
  if(tx.tx) tx=tx
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
// if(DBG) this.log("New TX: "+tx.id)
  if(tx.inputs[0] && tx.inputs[0].script && tx.outputs[0] && tx.outputs[0].script){
    if(this.isBMTransaction(tx)){
      if(DBG) this.log("New BM transaction ["+tx.id+"]");
      var srcAddr = tx.inputs[0].script.toAddress(this.node.network);
      var dstAddr = tx.outputs[0].script.toAddress(this.node.network);

      var msgsplit = tx.outputs[1].script.toString().split(" ")
      var data = hexToAscii(msgsplit[msgsplit.length-1])

      if(this.bmnet.isBMNodeAddr(dstAddr))
      try{
        this.collectMessage(srcAddr, dstAddr, data)
      } catch(e){ this.log(e) }
    }//if
  }//if
}//transactionHandler()

/* [API] listen for new BM messages */
BitMExService.prototype.waitMessage = function(net, callback){
  this.bus.on('bmservice/newmessage', function(msg){
    callback(null, "New message from "+msg.src+" to"+msg.dst+" : "+msg.data)
  })
}

/* [API] listen for new BM messages from a specific BTC address */
BitMExService.prototype.waitMessageFrom = function(src, callback){
  var srcAddr = this.bmnet.isBMNodeID(src) ? this.bmnet.getNodeAddress(src) : src

  if(this.isValidAddr(srcAddr)){
    var self=this
    this.bus.on('bmservice/newmessage', function(msg){
      if(msg.src == srcAddr || msg.src == self.bmnet.getNodeID(srcAddr))
        callback(null, "New Message to "+msg.dst+": "+msg.data)
    })
  }
  else return callback(null, "ERR: invalid source")
}

/* [API] listen for new BM messages to a node of the network */
BitMExService.prototype.waitMessageTo = function(dst, callback){
  if(this.bmnet.isBMNodeAddr(dst)) dst = this.bmnet.getNodeID(dst)

  if(this.bmnet.isBMNodeID(dst)){
    this.bus.on('bmservice/newmessage', function(msg){
      if(msg.dst == dst)
        callback(null, "New message from "+msg.src+": "+msg.data)
    })
  }
  else return callback(null, "ERR: invalid destination node")
}

/* Set API endpoints */
BitMExService.prototype.getAPIMethods = function(){
  return methods = [
    ['tryapi', this, this.tryapi, 1],
    ['addnode', this, this.addNode, 2],
    ['createnode', this, this.createNode, 1],
    ['removenode', this, this.removeNode, 1],
    ['sendmessage', this, this.sendMessage, 3],
    ['getmessages', this, this.getNodeMessages, 1],
    ['getnodestatus', this, this.getNodeStatus, 1],
    ['waitmessage', this, this.waitMessage, 1],
    ['waitmessagefrom', this, this.waitMessageFrom, 1],
    ['waitmessageto', this, this.waitMessageTo, 1],
  ];
};

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


/*__________ LOG __________*/
BitMExService.prototype.log = function(msg){
  return BMutils.log('BM', msg)
}

/*__________ EXPORT __________*/
module.exports = BitMExService;

/* CLI */
// if(process.argv[0] == ''){
//   const cmd = process.argv[2]
//   var argv = require('minimist')(process.argv.slice(3));
//   var args = argv._
//
//   // console.log(argv._);
//   // process.exit(0)
//   //TODO: option -noname: does not assign a name; use its addr instead
//   //TODO: (cmd) getmessages, getmessage
//
//   function printUsage(message){
//     if(message){
//       // console.log("ERROR");
//       console.log("USAGE: "+message);
//     }
//     else{
//       console.log("USAGE: node BitMEx CMD OPTIONS \n"+
//       " CMD: help|addnode|getmessages|sendmessage \n"+
//       " OPTIONS: \n\
//       -t, --testnet                   Use testnet network \n\
//       -a, --address <ADDR>            Bitcoin address\n\
//       -s, --source <ADDR>             Source node name\n\
//       -n, --name <NAME>               Node name\n\
//       -k, --privkey <PRIV_KEY_WIF>    Save node's private key\n\
//       -h                              Print help message\n\
//       ");
//     }
//
//    process.exit(0)
//   }
//
//   const addr = (argv.a ? argv.a : argv.address)
//   const name = (argv.n ? argv.n : argv.name)
//   const privk = (argv.pk ? argv.pk : argv.privkey)
//   const testnet = (argv.t ? argv.a : argv.testnet)
//
//   switch (cmd) {
//     case 'help':
//       printUsage()
//       break;
//
//     case 'addnode':
//       if(argv.h)
//         printUsage("addnode [-a ADDRESS] [-n NAME] [-k PRIVATE_KEY_WIF] [-t]")
//         //NO addr -> creates new addr; NO name -> a new name is chosen dynamically
//
//       BMNet.addBMNode(addr, name, privk);
//       break;
//
//     case 'createnetwork':
//   //TODO    BMNet.createBMNet()
//       break;
//
//     case 'getstatus':
//       if(!name){
//          console.log("Syntax: getstatus [NAME]"); process.exit(0);
//       }
//   //TODO getStatus(name) //if NO name return Network status
//       getNodeStatus(name);
//       break;
//
//     case 'getmessages':
//       //TODO
//       break;
//
//     case 'sendmessage':
//       var source = argv.s
//       var dest = argv._[0]
//       var msg = argv._[1]
//       var key = argv.k
//
//       if(!dest || !msg || argv.h){
//         //TODO: Explain how to use it
//         //TODO: SOURCE may be unknown, so one can use the address
//         printUsage("sendmessage DEST_ADDRESS MESSAGE \
//         [-s SOURCE_NODE | -a SOURCE_ADDRESS] [-k PRIV_KEY]")
//       }
//
//       BMNet.sendMessage(source, dest, msg, key)
//       break;
//
//     default:
//       printUsage();
//   }
// }
