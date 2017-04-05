/* ADNode.js */
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/* HELPER FUNCTIONS */
/********************************************************************/

/********************************************************************/

function ADNode(options, privkey){
  // EventEmitter.call(this)
  if(!options) throw "ERROR: Missing parameters to ADNode constructor"
  this.id = options.id
  this.bitcoinnode = options.node
  this.address = options.addr.toString()
  this.privkey = privkey

  var self = this;
  var bus = options.bus
  bus.on('adservice/newmessage', function(message){
    if(message.dst == self.id){
      // console.log('Node '+self.id+'(Address: '+self.address+')');
      self.handleMessage(message)
    }
  })

  if(self.id != 'broadcast'){
    bus.on('adservice/broadcast', function(msg){
      self.log(self.id,'Received broadcast message: '+msg);
      self.sendMessage(self.id,'broadcast','ack')
    })
  }
}

util.inherits(ADNode, EventEmitter);

/* Prints log with Node prefix */
ADNode.prototype.log = function(id, msg){
  return console.log('['+this.id+'] '+msg);
}

/* */
ADNode.prototype.sendMessage = function (source, dest, message){
  var self = this
  msg = message //+ payload

  this.bitcoinnode.services.adservice.sendMessage(source, dest, msg, function(){
    // console.log('message '+msg+' sent');
    self.log(self.id, "Message Sent")
  })
}

ADNode.prototype.handleMessage = function (message){ //node, sender,
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
    case 'chn':
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

ADNode.prototype.signMessage = function(tx){
  tx.sign(this.privkey)
}

module.exports = ADNode;
// module.exports.sign = signMessage
