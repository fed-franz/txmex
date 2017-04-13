/* BMNode.js */
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var fs = require('fs');
var BMutils = require('./BMutils')
const DBG = BMutils.DBG

/* Functions */
/********************************************************************/
function saveBMNode(nodeData, nodeDir){
  if (!fs.existsSync(nodeDir))
    fs.mkdirSync(nodeDir);

  fs.writeFileSync(nodeDir+'/'+nodeData.id+'.dat', JSON.stringify(nodeData, null, 2));
}

/********************************************************************/

/***** Constructor *****/
function BMNode(bmnet, nodeData, NEW){
  //nodeData.dataDir
  //TODO: if(!net && !nodeData && !addr) createBMNode(, true)
  // EventEmitter.call(this)
  if(!bmnet) throw "ERROR: Missing BMNet"

  this.bmnet = bmnet
  this.id = nodeData.id
  this.privKey = nodeData.privKey

  if(NEW) this.createBMNode(nodeData)

  /* Subscribe to BM events */
  var self = this
  var bus = bmnet.bus

  bus.on('bmservice/newmessage', function(message){
    if(message.dst == self.id){
      // self.log('(Address: '+self.getAddr()+')');
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

  if(DBG){
    this.log("Hello World!")
    this.log("Network:"+bmnet.name)
  }
}

util.inherits(BMNode, EventEmitter);

/* Create new Node */
BMNode.prototype.createBMNode = function(nodeData, TMP){
  if(!this.privKey)
    this.privKey = BMutils.createBTCKey()

  var BMNode = {
    "id": this.id,
    "privKey": this.privKey,
    "addr": this.getAddr(),
  }

  if(!TMP) saveBMNode(BMNode, this.bmnet.dir);

  return BMNode
}

/* Prints log with Node prefix */
BMNode.prototype.log = function(msg){
  return BMutils.log(this.id, msg)
}

/* Returns the BTC address */
BMNode.prototype.getAddr = function(){
  return BMutils.getBTCAddr(this.privKey, this.bmnet.node.network)
}

/* */
BMNode.prototype.sendMessage = function (source, dest, message){
  var self = this
  msg = message //+ payload

  //this.bitcoinnode.
  this.bmnet.node.services.bmservice.sendMessage(source, dest, msg, function(){
  //TRY this.node.services.bmservice.sendMessage(source, dest, msg, function(){
    // console.log('message '+msg+' sent');
    self.log(self.id, "Message Sent")
  })
}

/* Handle a received message */
BMNode.prototype.handleMessage = function (message){ //node, sender,
  //message construction: buildDataOut(hexString, 'hex');
  node = this.id
  msg = message.msg
  sender = message.src

  cmd = msg.substring(0,3)
  this.log(node, 'Message \''+cmd+'\' received'+' from '+sender);
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
