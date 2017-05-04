/* TMNode.js */
'use strict'

var fs = require('fs');
var TMutils = require('./TMutils')
const MODE = TMutils.MODE

/***** Constructor *****/
function TMNode(tmnet, nodeData, mode){
  // EventEmitter.call(this)
  if(!tmnet) throw "ERROR: Missing TMNet"

  this.tmnet = tmnet
  this.log = this.tmnet.log
  this.id = nodeData.id
  this.privKey = (nodeData.privKey ? nodeData.privKey : TMutils.createBTCKey())
  this.addr = TMutils.getBTCAddr(this.privKey, this.tmnet.tm.network)

  /* Subscribe to TM events */
  var bus = tmnet.tm.tms.bus
  var self = this
  bus.on('tmservice/newmessage', function(message){
    if(message.dst == self.id){
      self.handleMessage(message)
    }
  })

  //TODO: set per-network broadcast address
  if(this.id != 'broadcast'){
    bus.on('tmservice/broadcast', function(msg){
      self.log.info('New broadcast message: '+msg);
      /* Send ACK message to the sender */ //TODO: set optionally
      self.sendMessage('broadcast','ack')
    })
  }

  if(mode == MODE.NEW)
    this.saveData()
}

// util.inherits(TMNode, EventEmitter);

/* Delete node file */
TMNode.prototype.destroy = function(){
  var dir = this.tmnet.tm.dir

  fs.unlinkSync(dir+'/'+this.id+'.dat');
}

/* Save TMNode to file */
TMNode.prototype.saveData = function(){ //(dir, name, data)
  var nodeData = {
    "id": this.id,
    "privKey": this.privKey,
    "addr": this.getAddr(),
  }

  TMutils.saveObject(this.tmnet.tm.dir, this.id+'.dat', nodeData)
}

/* Returns the BTC address */
TMNode.prototype.getAddr = function(){
  return this.addr
}

/* Send a message */
TMNode.prototype.sendMessage = function(dst, msg){
  var src = this.id

  var self = this
  this.tmnet.tm.sendMessage(src, dst, msg, function(){
    self.log.info("["+this.id+"] Sent "+msg+" message to "+dst)
  })
}

/* Sign a transaction */ //TODO: Curently not used. Remove?
TMNode.prototype.signTransaction = function(tx){
  tx.sign(this.privKey)
}

/* Returns the PrivateKey of the node */
TMNode.prototype.getPrivKey = function(){
  return this.privKey
}

/* Handle a received message */
TMNode.prototype.handleMessage = function (message){
  var msg = message.data
  var src = message.src
  this.log.info("["+this.id+" ("+this.tmnet.tm.name+")] New message from "+src+": "+msg);

  /* Interpret commands in the message */
  //TODO: create rules set (this.rules)
  var cmd = msg.substring(0,3)
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

module.exports = TMNode;
