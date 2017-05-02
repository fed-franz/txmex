var util = require('util');
var fs = require( 'fs' );
var EventEmitter = require('events');
var bitcore = require('bitcore-lib');
var explorers = require('bitcore-explorers');

var index = require('../bitcore-node/index');
var errors = index.errors;
var log = index.log;

// var Service = require('bitcore-node').Service;
const BM = require('./BM')
const BMutils = require('./BMutils');
const MODE = BMutils.MODE
const DBG = BMutils.DBG

/* Set Data directory */
var dataDir = __dirname+'/data'
if(!fs.existsSync(dataDir)){
  fs.mkdirSync(dataDir);
}

//TODO: change api/mode/naming -> use bitcore call fn "{id:id, pk:asdlfhao9n}"

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
  }

  this.on('error', function(err) {
    log.error(err.stack);
  });
}
/* inherits the service base class */
util.inherits(BitMExService, EventEmitter);

/* Required services */
BitMExService.dependencies = ['bitcoind','web','insight-api'];

/* Start service */
BitMExService.prototype.start = function(callback){
  this.node.services.bitcoind.on('tx', this.transactionHandler.bind(this));
  this.bus = this.node.openBus()
  this.bus.subscribe('bmservice/newmessage');
  this.bus.subscribe('bmservice/broadcast');

  log.info("BitMEx Service Ready")
  try {
    //TODO: for each net - BitMExNet
    this.bm = new BM(this, {dir:dataDir, name:'defaultBMnet'})
    log.info("BitMEx: '"+this.bm.name+"' network has been loaded")
    var bmnodes = this.bm.bmnet.bmnodes
    if(Object.keys(bmnodes).length == 0)
      log.warn("BitMEx: '"+this.bm.name+"' network is empty")
  } catch (e) {
    log.error("ERROR: BitMEx failed to start: "+e);
    return callback(e)
  }

  callback();
};

/* stop */
BitMExService.prototype.stop = function(callback){
  callback();
};

/* Set service events */
BitMExService.prototype.getPublishEvents = function(){
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

  try{
    this.bm.handleTransaction(tx)
  } catch(e) { log.error("BitMEx: "+e) }
}//transactionHandler()

/* __________ API FUNCTIONS (NET) __________ */

/* [API] Prints the BMNet status */
BitMExService.prototype.getNetStatus = function(callback){
  callback(null, this.bm.bmnet.getStatus())
}

/* [API] Adds a new node to a BM network. Requires PrivateKey */
BitMExService.prototype.addNode = function(id, privKey, callback){
  if(!id || !privKey) callback(null, "Syntax: addnode {ID, \'auto\',\'temp\'} privkey")

  if(id == 'temp') var mode = MODE.TMP
  else var mode = MODE.NEW
  if(id == 'auto' || id == 'temp') id = ''

  try {
    var node = this.bm.bmnet.addBMNode({id, privKey}, mode)
  } catch (e) { return callback(null, "ERROR: "+e) }

  return callback(null, node)
}

/* [API] Creates a new node */
BitMExService.prototype.createNode = function(id, callback){
  if(id == 'temp') var mode = MODE.TMP
  else var mode = MODE.NEW
  if(id == 'auto' || id == 'temp') id = ''

  try {
    var node = this.bm.bmnet.addBMNode({id:id}, mode)
  } catch (e){ return callback(null, "ERROR: "+e) }

  return callback(null, node)
}

/* [API] Deletes a node */
BitMExService.prototype.removeNode = function(id, callback){
  try {
    this.bm.bmnet.removeBMNode(id)
  } catch (e){ return callback(null, "ERROR: "+e) }

  return callback(null, "Node "+id+" removed")
}

/* [API] Print the status of a node */
BitMExService.prototype.getNodeStatus = function(id, callback){
  try {
    this.bm.getNodeStatus(id, function(err, res){
      if(err) return callback(null, "ERROR: "+err)
      return callback(null, res)
    })
  } catch (e) { return callback(null, "ERROR: "+e) }
}

/* __________ API FUNCTIONS (MESSAGES) __________ */

/* [API] Print the status of a node */
BitMExService.prototype.getNodeMessages = function(id, callback){
  try{
    this.bm.getNodeMessages(id, function(err, res){
      if(err) return callback(null, "ERROR: "+err)
      return callback(null, res)
    })
  } catch (e) { return callback(null, "ERROR: "+e) }
}

/* [API] Send a message */
BitMExService.prototype.sendMessage = function(src, dst, msg, callback){
  try{
    this.bm.sendMessage(src, dst, msg, function(err, res){
      if(err) return callback(null, "ERROR: "+err)
      return callback(null, res)
    })
  } catch(e){ return callback(null, "ERROR: "+e) }
}

/* [API] listen for new BM messages */
BitMExService.prototype.waitMessage = function(net, callback){
  this.bus.on('bmservice/newmessage', function(msg){
    callback(null, "New message from "+msg.src+" to "+msg.dst+" : "+msg.data)
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

/*__________ WEB INTERFACE __________*/
/* Set server at http://localhost:3001/bitmex/ */
BitMExService.prototype.getRoutePrefix = function() {
  return 'bitmex'
};

/* Web Endpoints */
BitMExService.prototype.setupRoutes = function(app, express) {
  var self = this

  app.get('/broadcast', function(req, res) {
    // self.log('[Web] broadcast request received');
    //TODO: handle 'req'
    res.send('Broadcasting message \'hello world\'');

    for (var i = 0; i < self.subscriptions.broadcast.length; i++) {
      self.subscriptions.broadcast[i].emit('bmservice/broadcast', 'hello world');
    }
  });

  app.get('/status', function(req, res){
    status = self.bm.bmnet.getStatus()
    res.send(status)
  })

  // Serve static content
  app.use('/static', express.static(__dirname + '/static'));
};

/*****************************************************************************/

BitMExService.prototype.log = log
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

/*__________ EXPORT __________*/
module.exports = BitMExService;
