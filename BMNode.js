/* BMNode.js */
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/* HELPER FUNCTIONS */
/********************************************************************/

/********************************************************************/

function BMNode(options, privkey){
  // EventEmitter.call(this)
  if(!options) throw "ERROR: Missing parameters to BMNode constructor"
  this.id = options.id
  this.bitcoinnode = options.node
  this.address = options.addr.toString()
  this.privkey = privkey

  var self = this;
  var bus = options.bus
  bus.on('bmservice/newmessage', function(message){
    if(message.dst == self.id){
      // console.log('Node '+self.id+'(Address: '+self.address+')');
      self.handleMessage(message)
    }
  })

  if(self.id != 'broadcast'){
    bus.on('bmservice/broadcast', function(msg){
      self.log(self.id,'Received broadcast message: '+msg);
      self.sendMessage(self.id,'broadcast','ack')
    })
  }
}

util.inherits(BMNode, EventEmitter);

/* Prints log with Node prefix */
BMNode.prototype.log = function(id, msg){
  return console.log('['+this.id+'] '+msg);
}

/* */
BMNode.prototype.sendMessage = function (source, dest, message){
  var self = this
  msg = message //+ payload

  this.bitcoinnode.services.bmservice.sendMessage(source, dest, msg, function(){
  //TRY this.node.services.bmservice.sendMessage(source, dest, msg, function(){
    // console.log('message '+msg+' sent');
    self.log(self.id, "Message Sent")
  })
}

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

BMNode.prototype.signMessage = function(tx){
  tx.sign(this.privkey)
}

module.exports = BMNode;
// module.exports.sign = signMessage
