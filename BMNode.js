/* BMNode.js */
const DBG=true
var EventEmitter = require('events').EventEmitter;
var util = require('util');

/* Functions */
/********************************************************************/
function saveBMNode(nodeData){
  if (!fs.existsSync(DATA_FLDR))
    fs.mkdirSync(DATA_FLDR);

  fs.writeFileSync(DATA_FLDR+nodeData.name+".dat", JSON.stringify(nodeData, null, 2));
  //TODO: if addr start with m save to testnet
}

/* Create new Node */
function createBMNode(id, tmp){
  BTCNode = util.createBTC()

  var BMNode = {
    "id": id,
    "privKey": BTCNode.key,
    "tstAddr": BTCNode.tAddr,
    "liveAddr": BTCNode.addr,
  }

  if(!tmp)
    saveBMNode(BMNode)

  return BMNode
}

/********************************************************************/

/***** Constructor *****/
function BMNode(net, params, addr){

  //TODO: if(!net && !params && !addr) createBMNode(, true)
  // EventEmitter.call(this)
  if(!net || !params) throw "ERROR: Missing parameters to BMNode constructor"

  this.net = net
  this.id = params.name
  this.privkey = params.privkey
  //TODO: get Address from privkey ?
  this.address = addr.toString()

  var self = this;
  var bus = net.bus
  bus.on('bmservice/newmessage', function(message){
    if(message.dst == self.id){
      // console.log('Node '+self.id+'(Address: '+self.address+')');
      self.handleMessage(message)
    }
  })

  if(this.id != 'broadcast'){
    bus.on('bmservice/broadcast', function(msg){
      self.log(self.id,'Received broadcast message: '+msg);
      self.sendMessage(self.id,'broadcast','ack')
    })
  }

  if(DBG){
    this.log("Hello World!")
    this.log("Network:"+net.name)
  }
}

util.inherits(BMNode, EventEmitter);

/* Prints log with Node prefix */
BMNode.prototype.log = function(msg){
  id = this.id
  return console.log('['+id+'] '+msg);
}

/* */
BMNode.prototype.sendMessage = function (source, dest, message){
  var self = this
  msg = message //+ payload

  //this.bitcoinnode.
  this.net.node.services.bmservice.sendMessage(source, dest, msg, function(){
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
