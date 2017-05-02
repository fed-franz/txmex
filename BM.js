/* Bm.js */
'use strict'

var BitMEx = require('./BitMEx')
var BMNet = require('./BMNet')

const BMutils = require('./BMutils');
const DBG = BMutils.DBG
const isValidAddr = BMutils.isValidAddr
const hexToAscii = BMutils.hexToAscii

/* Constructor */
function BM(bms, options){
  if(!bms) throw "ERR: BM requires a Bitcore Node instance"

  //TODO: if(!options.name) genBMName
  if(!options.name) throw "ERR: missing 'name'"
  if (BMutils.existsFileDir()) throw "ERR: missing 'dir'"

  this.bms = bms
  this.network = bms.node.network
  this.name = options.name
  this.dir = options.dir+'/'+this.name
  BMutils.createDirectory(this.dir)
  this.msgDB = {}


  /* Load existing network  or create a new one */
  this.bmnet = new BMNet(this, {})
}

/*__________ NODES __________*/
/* Creates a new node */
/**
 Will return the ID of the new node
 @param {String} id - ID for the new node
 */
BM.prototype.createNode = function(id){
  if(!id) throw "ERR: Missing ID"
if(DBG) this.log("Creating new node")

  var nodeID = this.bmnet.addBMNode({id}, MODE.NEW)

  return nodeID
}

/* [API] Adds a new node to a BM network. Requires PrivateKey */
BM.prototype.addNode = function(options){
  if(!options) options = {}
  this.bmnet.addBMNode({id:options.id, pk:options.privKey}, options.mode)
}

/* [API] Deletes a node */
BM.prototype.removeNode = function(id){
  if(!id || !this.bmnet.isBMNodeID(id)) throw "ERR: Invalid ID"

  this.bmnet.removeBMNode(id)
}

/* Returns the status of a node */
BM.prototype.getNodeStatus = function(id, callback){
  if(!this.bmnet.isBMNodeID(id)) return callback("ERR: Invalid ID")

  var self = this
  var addr = this.bmnet.getNodeAddress(id)
  return BitMEx.getBMNodeStatus(addr, this.bms.node, function(err, status){
    if(err) return callback(err)

    /* Replace address with ID (if it belongs to local network) */
    var inbox = status.messages.inbox
    for(var i in inbox){
      var msg = inbox[i]
      if(self.bmnet.isBMNodeAddr(msg.src))
        msg.src = self.bmnet.getNodeID(msg.src)
    }
    var outbox = status.messages.outbox
    for(var i in outbox){
      var msg = outbox[i]
      if(self.bmnet.isBMNodeAddr(msg.dst))
        msg.dst = self.bmnet.getNodeID(msg.dst)
    }
    return callback(null, status)
  })//getBMNodeStatus
}

/* Returns the BM messages of a node */
BM.prototype.getNodeMessages = function(id, callback){
  var nodeAddr = this.bmnet.getNodeAddress(id)

  try {
    var self = this
    BitMEx.getBMMessages(nodeAddr, this.bms.node, function(err, msgs){
      /* Add node ID to the result */
      for(var i in msgs){
        var msg = msgs[i]
        if(self.bmnet.isBMNodeAddr(msg.src))
          msgs[i].src = self.bmnet.getNodeID(msg.src)
        if(self.bmnet.isBMNodeAddr(msg.dst))
          msgs[i].dst = self.bmnet.getNodeID(msg.dst)
      }

      return callback(null, msgs)
    })//getBMMessages
  } catch (e) { return callback(e) }
}

/*__________ SENDER FUNCTIONS __________*/
/* Send a message */
BM.prototype.sendMessage = function(src, dst, msg, callback){
  if(DBG) this.log("sendMessage - \'"+msg+"\' from "+src+" to "+dst);

  /* Check src and dst */
  var srcAddr = this.bmnet.getNodeAddress(src)
  if(!srcAddr) throw "ERR: invalid source"
  var dstAddr = this.bmnet.getNodeAddress(dst)
  if(!dstAddr)
    if(isValidAddr(dst, this.network))
      dstAddr = dst
    else throw "ERR: invalid destination"

  var msgData = {
    src: srcAddr,
    dst: dstAddr,
    msg: msg,
    pk: this.bmnet.getNode(src).getPrivKey()
  }
  BitMEx.sendBMMessage(msgData, callback)
}

/*__________ RECEIVER FUNCTIONS __________*/
/* Handles received transactions */
BM.prototype.handleTransaction = function(tx) {
  if(BitMEx.isBMTransaction(tx)){
if(DBG) this.log("New BM transaction ["+tx.id+"]");
    var src = tx.inputs[0].script.toAddress(this.network);
    var dst = tx.outputs[0].script.toAddress(this.network);

    var msgsplit = tx.outputs[1].script.toString().split(" ")
    var data = hexToAscii(msgsplit[msgsplit.length-1])

    if(this.bmnet.isBMNodeAddr(dst))
      this.collectMessage(src, dst, data)
  }//if(isBMTransaction)
}//transactionHandler()

/* Collects received chunks */
//TODO: handle multiple messages from A to B. Add Msg ID/timestamp?
BM.prototype.collectMessage = function (src, dst, data){
  src = src.toString()
  dst = dst.toString()
  var msglen = parseInt(data.charAt(3), 16);
  var msgseq = parseInt(data.charAt(4), 16);
  var msg = data.slice(5)
  var msgid = src+dst

  /* Add chunk to temporary storage */
  var msgDB = this.msgDB
  if(!msgDB[msgid])
    msgDB[msgid] = new Array(msglen)
  msgDB[msgid][msgseq] = msg

  /* Check if we have all chunks */
  var complete = true
  for(var j=0; j<msglen; j++)
    if(!msgDB[msgid][j]) complete = false;

  /* If a message is complete, deliver it */
  if(complete){
    var fullmsg = BMutils.assembleChunks(msgDB[msgid])
    var srcNode = this.bmnet.isBMNodeAddr(src) ? this.bmnet.getNodeID(src) : src
    var dstNode = this.bmnet.getNodeID(dst)

    this.deliverMessage(srcNode, dstNode, fullmsg)
    delete msgDB[msgid]
  }
}

/* Delive message to the BM network */
BM.prototype.deliverMessage = function(src, dst, data){
  var message = {src:src, dst:dst, data:data}

  /* Emits 'newmessage' event notifications to BM Nodes */
  for(var i = 0; i < this.bms.subscriptions.newmessage.length; i++)
    this.bms.subscriptions.newmessage[i].emit('bmservice/newmessage', message);
}

/*****************************************************************************/

BM.prototype.log = function(msg){
  return BMutils.log('BM', msg)
}

module.exports = BM;
