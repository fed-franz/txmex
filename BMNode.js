/* BMNode.js */
// var EventEmitter = require('events').EventEmitter;
// var util = require('util');
var fs = require('fs');
var BMutils = require('./BMutils')
const DBG = BMutils.DBG
const MODE = BMutils.MODE

/***** Constructor *****/
function BMNode(bmnet, nodeData, mode){
  // EventEmitter.call(this)
  if(!bmnet) throw "ERROR: Missing BMNet"

  this.bmnet = bmnet
  this.id = nodeData.id
  this.privKey = (nodeData.privKey ? nodeData.privKey : BMutils.createBTCKey())
  this.addr = BMutils.getBTCAddr(this.privKey, this.bmnet.bm.network)

  /* Subscribe to BM events */
  var bus = bmnet.bm.bms.bus
  var self = this
  bus.on('bmservice/newmessage', function(message){
    if(message.dst == self.id){
      self.handleMessage(message)
    }
  })

  //TODO: set per-network broadcast address
  if(this.id != 'broadcast'){
    bus.on('bmservice/broadcast', function(msg){
      self.log('Received broadcast message: '+msg);
      /* Send ACK message to the sender */ //TODO: set optionally
      self.sendMessage('broadcast','ack')
    })
  }

  if(mode == MODE.NEW)
    this.saveData()

  if(DBG) this.log("Hello World!")
}

// util.inherits(BMNode, EventEmitter);

/* Delete node file */
BMNode.prototype.destroy = function(){
  var dir = this.bmnet.bm.dir

  fs.unlinkSync(dir+'/'+this.id+'.dat');
}

/* Save BMNode to file */
BMNode.prototype.saveData = function(){ //(dir, name, data)
  if(DBG) this.log("Saving data...")

  var nodeData = {
    "id": this.id,
    "privKey": this.privKey,
    "addr": this.getAddr(),
  }

  BMutils.saveObject(this.bmnet.bm.dir, this.id+'.dat', nodeData)
}

/* Returns the BTC address */
BMNode.prototype.getAddr = function(){
  return this.addr
}

/* Send a message */
BMNode.prototype.sendMessage = function(dst, msg){
  var src = this.id

  var self = this
  this.bmnet.bm.sendMessage(src, dst, msg, function(){
    if(DBG) self.log("Message "+msg+" sent")
  })
}

/* Sign a transaction */ //TODO: Curently not used. Remove?
BMNode.prototype.signTransaction = function(tx){
  tx.sign(this.privKey)
}

/* Returns the PrivateKey of the node */
BMNode.prototype.getPrivKey = function(){
  return this.privKey
}

/* Handle a received message */
BMNode.prototype.handleMessage = function (message){
  msg = message.data
  src = message.src
  if(DBG) this.log('Message from \''+src+'\': '+msg);

  /* Interpret commands in the message */
  //TODO: create rules set (this.rules)
  cmd = msg.substring(0,3)
  switch (cmd) {
    case 'ack':
      break;
    case 'png':
      this.sendMessage(src, 'ack')
      break;
    default:
      // this.log('Unknown Command '+cmd);
  }
};

/*****************************************************************************/

/* Prints log with Node prefix */
BMNode.prototype.log = function(msg){
  return BMutils.log(this.id, msg)
}

module.exports = BMNode;
