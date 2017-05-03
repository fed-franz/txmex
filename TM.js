/* Bm.js */
'use strict'

var TxMEx = require('./TxMEx')
var TMNet = require('./TMNet')

const TMutils = require('./TMutils');
const isValidAddr = TMutils.isValidAddr
const hexToAscii = TMutils.hexToAscii

/* Constructor */
function TM(tms, options){
  if(!tms) throw "ERR: TM requires a Bitcore Node instance"

  //TODO: if(!options.name) genTMName
  if(!options.name) throw "ERR: missing 'name'"
  if (TMutils.existsFileDir()) throw "ERR: missing 'dir'"

  this.tms = tms
  this.network = tms.node.network
  this.name = options.name
  this.dir = options.dir+'/'+this.name
  TMutils.createDirectory(this.dir)
  this.msgDB = {}

  this.log = this.tms.log
  /* Load existing network  or create a new one */
  this.tmnet = new TMNet(this, {})
}

/*__________ NODES __________*/
/* Creates a new node */
/**
 Will return the ID of the new node
 @param {String} id - ID for the new node
 */
TM.prototype.createNode = function(id){
  if(!id) throw "ERR: Missing ID"

  var nodeID = this.tmnet.addTMNode({id}, MODE.NEW)

  return nodeID
}

/* [API] Adds a new node to a TM network. Requires PrivateKey */
TM.prototype.addNode = function(options){
  if(!options) options = {}
  this.tmnet.addTMNode({id:options.id, pk:options.privKey}, options.mode)
}

/* [API] Deletes a node */
TM.prototype.removeNode = function(id){
  if(!id || !this.tmnet.isTMNodeID(id)) throw "ERR: Invalid ID"

  this.tmnet.removeTMNode(id)
}

/* Returns the status of a node */
TM.prototype.getNodeStatus = function(id, callback){
  if(!this.tmnet.isTMNodeID(id)) return callback("ERR: Invalid ID")

  var self = this
  var addr = this.tmnet.getNodeAddress(id)
  return TxMEx.getTMNodeStatus(addr, this.tms.node, function(err, status){
    if(err) return callback(err)

    /* Replace address with ID (if it belongs to local network) */
    var inbox = status.messages.inbox
    for(var i in inbox){
      var msg = inbox[i]
      if(self.tmnet.isTMNodeAddr(msg.src))
        msg.src = self.tmnet.getNodeID(msg.src)
    }
    var outbox = status.messages.outbox
    for(var i in outbox){
      var msg = outbox[i]
      if(self.tmnet.isTMNodeAddr(msg.dst))
        msg.dst = self.tmnet.getNodeID(msg.dst)
    }
    return callback(null, status)
  })//getTMNodeStatus
}

/* Returns the TM messages of a node */
TM.prototype.getNodeMessages = function(id, callback){
  var nodeAddr = this.tmnet.getNodeAddress(id)

  try {
    var self = this
    TxMEx.getTMMessages(nodeAddr, this.tms.node, function(err, msgs){
      /* Add node ID to the result */
      for(var i in msgs){
        var msg = msgs[i]
        if(self.tmnet.isTMNodeAddr(msg.src))
          msgs[i].src = self.tmnet.getNodeID(msg.src)
        if(self.tmnet.isTMNodeAddr(msg.dst))
          msgs[i].dst = self.tmnet.getNodeID(msg.dst)
      }

      return callback(null, msgs)
    })//getTMMessages
  } catch (e) { return callback(e) }
}

/*__________ SENDER FUNCTIONS __________*/
/* Send a message */
TM.prototype.sendMessage = function(src, dst, msg, callback){
  this.log.info("Sending message - \'"+msg+"\' from "+src+" to "+dst);

  /* Check src and dst */
  var srcAddr = this.tmnet.getNodeAddress(src)
  if(!srcAddr) throw "ERR: invalid source"
  var dstAddr = this.tmnet.getNodeAddress(dst)
  if(!dstAddr)
    if(isValidAddr(dst, this.network))
      dstAddr = dst
    else throw "ERR: invalid destination"

  var msgData = {
    src: srcAddr,
    dst: dstAddr,
    msg: msg,
    pk: this.tmnet.getNode(src).getPrivKey()
  }
  TxMEx.sendTMMessage(msgData, callback)
}

/*__________ RECEIVER FUNCTIONS __________*/
/* Handles received transactions */
TM.prototype.handleTransaction = function(tx) {
  if(TxMEx.isTMTransaction(tx)){
    this.log.info("TxMEx transaction received: "+tx.id);
    var src = tx.inputs[0].script.toAddress(this.network);
    var dst = tx.outputs[0].script.toAddress(this.network);

    var msgsplit = tx.outputs[1].script.toString().split(" ")
    var data = hexToAscii(msgsplit[msgsplit.length-1])

    if(this.tmnet.isTMNodeAddr(dst))
      this.collectMessage(src, dst, data)
  }//if(isTMTransaction)
}//transactionHandler()

/* Collects received chunks */
//TODO: handle multiple messages from A to B. Add Msg ID/timestamp?
TM.prototype.collectMessage = function (src, dst, data){
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
    var fullmsg = TMutils.assembleChunks(msgDB[msgid])
    var srcNode = this.tmnet.isTMNodeAddr(src) ? this.tmnet.getNodeID(src) : src
    var dstNode = this.tmnet.getNodeID(dst)

    this.deliverMessage(srcNode, dstNode, fullmsg)
    delete msgDB[msgid]
  }
}

/* Delive message to the TM network */
TM.prototype.deliverMessage = function(src, dst, data){
  var message = {src:src, dst:dst, data:data}

  /* Emits 'newmessage' event notifications to TM Nodes */
  for(var i = 0; i < this.tms.subscriptions.newmessage.length; i++)
    this.tms.subscriptions.newmessage[i].emit('tmservice/newmessage', message);
}

/*****************************************************************************/

module.exports = TM;
