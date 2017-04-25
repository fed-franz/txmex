var util = require('util');
var fs = require( 'fs' );
var EventEmitter = require('events');
var bitcore = require('bitcore-lib');
var explorers = require('bitcore-explorers');

// var Service = require('bitcore-node').Service;
const BitMEx = require('./BitMEx')
const BMNet = require('./BMNet');
const BMutils = require('./BMutils');
const BTC = BMutils.BTC
const MODE = BMutils.MODE
const DBG = BMutils.DBG

/* Set Data directory */
var dataDir = __dirname+'/data'
if(!fs.existsSync(dataDir)){
  fs.mkdirSync(dataDir);
}

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
    //TODO: for each net
    this.bm = new BitMEx(this, {name: 'tstBMnet', dir: dataDir})
  } catch (e) {
    this.log("ERR: Failed to start: "+e);
    return callback(e)
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

/* Handles received transactions */
BitMExService.prototype.transactionHandler = function(txBuffer) {
  var tx = bitcore.Transaction().fromBuffer(txBuffer);
// if(DBG) this.log("New TX: "+tx.id)
  try{
    this.bm.handleTransaction(tx)
  } catch(e) { this.log(e) }
}//transactionHandler()

/* __________ API FUNCTIONS (NET) __________ */

/* [API] Prints the BMNet status */
BitMExService.prototype.getNetStatus = function(callback){
  callback(null, this.bm.bmnet.getStatus())
}

/* [API] Adds a new node to a BM network. Requires PrivateKey */
BitMExService.prototype.addNode = function(id, privKey, callback){
  if(!id || !privKey) callback(null, "Syntax: addnode {ID, \'auto\',\'temp\'} privkey")

  var mode = MODE.NEW
  if(id == 'auto') id = ''
  if(id == 'temp') mode = MODE.TMP
  try {
    this.bm.bmnet.addBMNode({id, privKey}, mode)
  } catch (e) {
    return callback(null, e)
  }

  return callback(null, "Node "+id+" added")
}

/* [API] Creates a new node */
BitMExService.prototype.createNode = function(id, callback){
  if(!id) callback(null, "ERR: Missing ID")

  try {
    var nodeID = this.bm.bmnet.addBMNode({id}, MODE.NEW)
  } catch (e){ return callback(e) }

  return callback(null, "Node "+nodeID+" created")
}

/* [API] Deletes a node */
BitMExService.prototype.removeNode = function(id, callback){
  if(!id) return callback(null, "Syntax: removenode ID")
  // if(DBG) this.log("Removing node "+id)

  try {
    this.bm.bmnet.removeBMNode(id)
  } catch (e){ return callback(null, "ERR:"+e) }

  return callback(null, "Node "+id+" removed")
}

/* [API] Print the status of a node */
BitMExService.prototype.getNodeStatus = function(id, callback){
  if(!id) callback(null, "ERR: Missing ID")

  try {
    this.bm.getNodeStatus(id, function(err, res){
      if(err) return callback(null, err)
      return callback(null, res)
    })
  } catch (e) { return callback(null, e) }
}

/* __________ API FUNCTIONS (MESSAGES) __________ */

/* [API] Print the status of a node */
BitMExService.prototype.getNodeMessages = function(id, callback){
  if(!id) callback(null, "ERR: Missing ID")

  try{
    this.bm.getNodeMessages(id, function(err, res){
      if(err) return callback(null, err)
      return callback(null, "Messages:"+res)
    })
  } catch (e) { return callback(null, e) }
}

/* [API] Send a message */
BitMExService.prototype.sendMessage = function(src, dst, msg, callback){
  try{
    this.bm.sendMessage(src, dst, msg, function(err, res){
      if(err) return callback(null, err)
      return callback(null, res)
    })
  } catch(e){ return callback(null, e) }
}

/* [API] listen for new BM messages */
BitMExService.prototype.waitMessage = function(net, callback){
  this.bus.on('bmservice/newmessage', function(msg){
    callback(null, "New message from "+msg.src+" to"+msg.dst+" : "+msg.data)
  })
}

/* [API] listen for new BM messages from a specific BTC address */
BitMExService.prototype.waitMessageFrom = function(src, callback){
  var srcAddr = this.bm.bmnet.isBMNodeID(src) ? this.bm.bmnet.getNodeAddress(src) : src

  if(BMutils.isValidAddr(srcAddr, this.node.network)){
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
  if(this.bm.bmnet.isBMNodeAddr(dst)) dst = this.bm.bmnet.getNodeID(dst)

  if(this.bm.bmnet.isBMNodeID(dst)){
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
    ['getnetstatus', this, this.getNetStatus, 0],
    ['addnode', this, this.addNode, 2],
    ['createnode', this, this.createNode, 1],
    ['removenode', this, this.removeNode, 1],
    ['getnodestatus', this, this.getNodeStatus, 1],
    ['sendmessage', this, this.sendMessage, 3],
    ['getmessages', this, this.getNodeMessages, 1],
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
  return BMutils.log('BMService', msg)
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
