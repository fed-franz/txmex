/* BMNode.js */
var EventEmitter = require('events').EventEmitter;
var util = require('util');
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
  this.addr = BMutils.getBTCAddr(this.privKey, this.bmnet.bms.node.network)

  /* Subscribe to BM events */
  var bus = bmnet.bms.bus
  var self = this
  bus.on('bmservice/newmessage', function(message){
    if(message.dst == self.id){
      self.handleMessage(message)
    }
  })

  //TODO: set per-network broadcast address
  if(this.id != 'broadcast'){
    bus.on('bmservice/broadcast', function(msg){
      self.log(self.id,'Received broadcast message: '+msg);
      /* Send ACK message to the sender */ //TODO: set optionally
      self.sendMessage(self.id,'broadcast','ack')
    })
  }

  if(mode == MODE.NEW && mode != MODE.TMP)
    this.saveData()

  if(DBG) this.log("Hello World!")
}

util.inherits(BMNode, EventEmitter);

/* Save BMNode to file */
BMNode.prototype.saveData = function(){
  if(DBG) this.log("Saving data...")
  var dir = this.bmnet.dir
  var BMNode = {
    "id": this.id,
    "privKey": this.privKey,
    "addr": this.getAddr(),
  }

  /* Write to disk */
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir);
  fs.writeFileSync(dir+'/'+this.id+'.dat', JSON.stringify(BMNode, null, 2));
}

/* Prints log with Node prefix */
BMNode.prototype.log = function(msg){
  return BMutils.log(this.id, msg)
}

/* Returns the BTC address */
BMNode.prototype.getAddr = function(){
  return this.addr
}

/* Get node status */
BMNode.prototype.getStatus = function(callback){
  var insight = this.bmnet.bms.insight
  var self = this

  insight.getUnspentUtxos(this.addr, function(err, utxos){
    if(err) throw "[insight.getUnspentUtxos] "+err;

    var status = {
      "ID": self.id,
      "Address": self.addr,
      "UTXOs": utxos
      //TODO: messages
    }
    callback(null, status)
  });
}

/* */
BMNode.prototype.sendMessage = function(source, dest, message){
  var self = this
  msg = message

  this.bmnet.bms.sendMessage(source, dest, msg, function(){
  if(DBG) self.log(self.id, "Message "+message+" sent")
  })
}

/* Sign a transaction */
BMNode.prototype.signTransaction = function(tx){
  tx.sign(this.privKey)
}

/* Handle a received message */
BMNode.prototype.handleMessage = function (message){
  if(DBG) this.log('New message from \''+sender+'\': '+msg);
  node = this.id
  msg = message.msg
  sender = message.src

  /* Interpret commands in the message */
  cmd = msg.substring(0,3)
  switch (cmd) {
    case 'ack':
      break;
    case 'png':
      this.sendMessage(node, sender, 'ack')
      break;
    default:
      this.log(node, 'Unknown Command '+cmd);
  }
};

module.exports = BMNode;

/* Retrieve messages for Node Nx*/
function receiveMessage(node, sender, msg){
  //bms.getMessages()
};
