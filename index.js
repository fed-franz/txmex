var util = require('util');
var fs = require( 'fs' );
var EventEmitter = require('events');
var bitcore = require('bitcore-lib');

var index = require('../bitcore-node/index');
var errors = index.errors;
var log = index.log;

// var Service = require('bitcore-node').Service;
const TM_NAME = 'TxMEx'
const TM = require('./TM')
const TMutils = require('./TMutils');
const MODE = TMutils.MODE
const DBG = TMutils.DBG

/* Set Data directory */
var dataDir = __dirname+'/data'
if(!fs.existsSync(dataDir)){
  fs.mkdirSync(dataDir);
}

//TODO: change api/mode/naming -> use bitcore call fn "{id:id, pk:asdlfhao9n}"

/* TM Service Class */
/********************************************************************/
/* Constructor */
function TxMExService(options){
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
util.inherits(TxMExService, EventEmitter);

/* Required services */
TxMExService.dependencies = ['bitcoind','web','insight-api'];

/* Start service */
TxMExService.prototype.start = function(callback){
  this.node.services.bitcoind.on('tx', this.transactionHandler.bind(this));
  this.bus = this.node.openBus()
  this.bus.subscribe('bmservice/newmessage');
  this.bus.subscribe('bmservice/broadcast');

  log.info("TxMEx Service Ready")
  try {
    //TODO: for each net - TxMExNet
    this.bm = new TM(this, {dir:dataDir, name:'defaultTMnet'})
  } catch (e) {
    log.error("ERROR: TxMEx failed to start: "+e);
    return callback(e)
  }

  callback();
};

/* stop */
TxMExService.prototype.stop = function(callback){
  callback();
};

/* Set service events */
TxMExService.prototype.getPublishEvents = function(){
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

TxMExService.prototype.subscribe = function(name, emitter) {
  this.subscriptions[name].push(emitter);
};

TxMExService.prototype.unsubscribe = function(name, emitter) {
  var index = this.subscriptions[name].indexOf(emitter);
  if (index > -1) {
    this.subscriptions[name].splice(index, 1);
  }
};

/* Handles received transactions */
TxMExService.prototype.transactionHandler = function(txBuffer) {
  var tx = bitcore.Transaction().fromBuffer(txBuffer);

  try{
    this.bm.handleTransaction(tx)
  } catch(e) { log.error("TxMEx: "+e) }
}//transactionHandler()

/* __________ API FUNCTIONS (NET) __________ */

/* [API] Prints the TMNet status */
TxMExService.prototype.getNetStatus = function(callback){
  callback(null, this.bm.bmnet.getStatus())
}

/* [API] Adds a new node to a TM network. Requires PrivateKey */
TxMExService.prototype.addNode = function(id, privKey, callback){
  if(!id || !privKey) callback(null, "Syntax: addnode {ID, \'auto\',\'temp\'} privkey")

  if(id == 'temp') var mode = MODE.TMP
  else var mode = MODE.NEW
  if(id == 'auto' || id == 'temp') id = ''

  try {
    var node = this.bm.bmnet.addTMNode({id, privKey}, mode)
  } catch (e) { return callback(null, "ERROR: "+e) }

  return callback(null, node)
}

/* [API] Creates a new node */
TxMExService.prototype.createNode = function(id, callback){
  if(id == 'temp') var mode = MODE.TMP
  else var mode = MODE.NEW
  if(id == 'auto' || id == 'temp') id = ''

  try {
    var node = this.bm.bmnet.addTMNode({id:id}, mode)
  } catch (e){ return callback(null, "ERROR: "+e) }

  return callback(null, node)
}

/* [API] Deletes a node */
TxMExService.prototype.removeNode = function(id, callback){
  try {
    this.bm.bmnet.removeTMNode(id)
  } catch (e){ return callback(null, "ERROR: "+e) }

  return callback(null, "Node "+id+" removed")
}

/* [API] Print the status of a node */
TxMExService.prototype.getNodeStatus = function(id, callback){
  try {
    this.bm.getNodeStatus(id, function(err, res){
      if(err) return callback(null, "ERROR: "+err)
      return callback(null, res)
    })
  } catch (e) { return callback(null, "ERROR: "+e) }
}

/* __________ API FUNCTIONS (MESSAGES) __________ */

/* [API] Print the status of a node */
TxMExService.prototype.getNodeMessages = function(id, callback){
  try{
    this.bm.getNodeMessages(id, function(err, res){
      if(err) return callback(null, "ERROR: "+err)
      return callback(null, res)
    })
  } catch (e) { return callback(null, "ERROR: "+e) }
}

/* [API] Send a message */
TxMExService.prototype.sendMessage = function(src, dst, msg, callback){
  try{
    this.bm.sendMessage(src, dst, msg, function(err, res){
      if(err) return callback(null, "ERROR: "+err)
      return callback(null, res)
    })
  } catch(e){ return callback(null, "ERROR: "+e) }
}

/* [API] listen for new TM messages */
TxMExService.prototype.waitMessage = function(net, callback){
  this.bus.on('bmservice/newmessage', function(msg){
    callback(null, "New message from "+msg.src+" to "+msg.dst+" : "+msg.data)
  })
}

/* [API] listen for new TM messages from a specific BTC address */
TxMExService.prototype.waitMessageFrom = function(src, callback){
  var srcAddr = this.bm.bmnet.isTMNodeID(src) ? this.bm.bmnet.getNodeAddress(src) : src

  if(TMutils.isValidAddr(srcAddr, this.node.network)){
    var self=this
    this.bus.on('bmservice/newmessage', function(msg){
      if(msg.src == srcAddr || msg.src == self.bmnet.getNodeID(srcAddr))
        callback(null, "New Message to "+msg.dst+": "+msg.data)
    })
  }
  else return callback(null, "ERR: invalid source")
}

/* [API] listen for new TM messages to a node of the network */
TxMExService.prototype.waitMessageTo = function(dst, callback){
  if(this.bm.bmnet.isTMNodeAddr(dst)) dst = this.bm.bmnet.getNodeID(dst)

  if(this.bm.bmnet.isTMNodeID(dst)){
    this.bus.on('bmservice/newmessage', function(msg){
      if(msg.dst == dst)
        callback(null, "New message from "+msg.src+": "+msg.data)
    })
  }
  else return callback(null, "ERR: invalid destination node")
}

/*__________ WEB INTERFACE __________*/
/* Set server at http://localhost:3001/bitmex/ */
TxMExService.prototype.getRoutePrefix = function() {
  return 'bitmex'
};

/* Web Endpoints */
TxMExService.prototype.setupRoutes = function(app, express) {
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

TxMExService.prototype.log = {
  info: function(msg) {log.info(TM_NAME+": "+msg)},
  warn: function(msg) {log.warn(TM_NAME+": "+msg)},
  error: function(msg) {log.error(TM_NAME+": "+msg)},
}

/* Set API endpoints */
TxMExService.prototype.getAPIMethods = function(){
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

module.exports = TxMExService;
