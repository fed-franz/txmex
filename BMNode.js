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
  this.addr = BMutils.getBTCAddr(this.privKey, this.bmnet.node.network)

  /* Subscribe to BM events */
  var bus = bmnet.bus
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
//TODO

/* */
BMNode.prototype.sendMessage = function (source, dest, message){
  var self = this
  msg = message //+ payload

  //this.bitcoinnode.
  this.bmnet.node.services.bmservice.sendMessage(source, dest, msg, function(){
  self.log(self.id, "Message "+message+" Sent")
  })
}

/* Handle a received message */
BMNode.prototype.handleMessage = function (message){ //node, sender,
  //message construction: buildDataOut(hexString, 'hex');
  node = this.id
  msg = message.msg
  sender = message.src

  this.log('Message \''+msg+'\' received'+' from '+sender);
  cmd = msg.substring(0,3)
  switch (cmd) {
    case 'ack':
      break;
    case 'png':
      this.sendMessage(node, sender, 'ack')
      break;
    case 'chn': //WARN: experimental command
      switch (node) {
        case 'N1':
          this.sendMessage(node, "N2", 'chn')
          break;
        case 'N2':
          this.sendMessage(node, "N3", 'chn')
          break;
        case 'N3':
          this.log(node,"Loop closed");
          break;
        default:
          this.log(node,'Something is wrong...');
      }
      break;
    default:
      this.log(node, 'Unknown Command '+cmd);
  }
};

/* Sign a transaction */
BMNode.prototype.signTransaction = function(tx){
  tx.sign(this.privKey)
}

module.exports = BMNode;

/* Retrieve messages for Node Nx*/
function receiveMessage (node, sender, msg){
  //bms.getMessages()
};
