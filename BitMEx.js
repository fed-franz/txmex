const bitcore = require('bitcore-lib')
const explorers = require('bitcore-explorers');

const Networks = bitcore.Networks
const tBTC = Networks.testnet
const BTC = Networks.livenet

var BMNode = require('./BMNode')
var BMNet = require('./BMNet')

const TX_PREFIX = "BM"
const MAX_PAYLOAD_SIZE = 76
const MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT

const BMutils = require('./BMutils');
const MODE = BMutils.MODE
const DBG = BMutils.DBG
const hexToAscii = BMutils.hexToAscii

/* Extract embedded data from TX output */
/**
 * @param {bitcore.Transaction} tx
 * @param {Number} index - index of transaction output to extract data from
 */
var getTxData = function(tx, index){
  var txOut = tx.outputs[index-1]
  if(!txOut) return null

  /* Get script for the 2nd output */
  var script = txOut.script
  if(!script.isDataOut()) return null

  /* Decode */
  var msgsplit = script.toString().split(" ")
  var msgcode = msgsplit[msgsplit.length-1]
  var data = hexToAscii(msgcode)

  return data
}

/* Check 'tx' for BM messages */
var isBMTransaction = function(tx){
  if(!(tx.inputs[0] && tx.inputs[0].script && tx.outputs[0] && tx.outputs[0].script))
    return false
  if(tx.outputs.length < 2) return false

  /* Get script for the 2nd output */
  var data = getTxData(tx, 2)
  if(!data) return false

  /* Verify BM prefix */
  var BMcode = data.substring(0,3)
  if(BMcode.localeCompare(TX_PREFIX) != 0) return false

  return true
}//isBMTransaction()

/* Extract the embedded message (if any) */
var getBMMessage = function(tx){
  if(tx.tx) tx = tx.tx

  if(!isBMTransaction(tx)) return null

  var msgsplit = tx.outputs[1].script.toString().split(" ")
  var data = hexToAscii(msgsplit[msgsplit.length-1])

  var msglen = parseInt(data.charAt(3), 16);
  var msgseq = parseInt(data.charAt(4), 16);
  var msg = data.slice(5)

  return {'seq':msgseq, 'len':msglen, 'msg':msg}
}

/**/
var isValidAddr = function(addr, network){
  return bitcore.Address.isValid(addr, network)
}

/* Send a BitMEx message */
var sendBMMessage = function(msgData, network, insight, callback){
  var srcAddr = msgData.src
  var dstAddr = msgData.dst
  var msg = msgData.msg
  var privKey = msgData.pk

  /* Check src and dst */
  if(!isValidAddr(srcAddr, network) || !isValidAddr(dstAddr, network))
    return callback("ERR: invalid address")
  if(!network) network = Networks.defaultNetwork;
  if(!insight) insight = new explorers.Insight(network);

  /* Split message in chunks */
  var chunks = BMutils.chunkMessage(msg, MAX_PAYLOAD_SIZE)

  /* Function to send a transaction with an embedde message chunk */
  var senttxs = []
  var sendMsgTransaction = function(seq, cb){
    /* Get UTXOs to fund new transaction */
    insight.getUnspentUtxos(srcAddr, function(err, utxos){
      if(err) return cb("[insight.getUnspentUtxos]: "+err);
      if(utxos.length == 0){
        if(network == BTC)
          return cb("ERR: Not enough Satoshis to make transaction");
        else{
          //TODO: get new coins from faucet AND RETRY
          return cb("ERR: Not enough Satoshis to make transaction");
        }
      }

      /* Set the prefix */
      seqcode = seq.toString(16)
      len = chunks.length.toString(16)
      var prefix = TX_PREFIX + len + seqcode

      /* Create Transaction */
      try {
        var tx = new bitcore.Transaction()
        .from(utxos)
        .to(dstAddr, MIN_AMOUNT)
        .change(srcAddr)
        .addData(prefix+chunks[seq])
      } catch (e){ return cb(e) }

      /* Set estimate fee (not based on priority) -> check returned value */
      tx.fee(tx.getFee())

      /* Let the node sign the transaction */
      try{
        tx.sign(privKey)
      } catch(e){ return cb(e) }

      //TODO: verify serialization errors (see at the end of this file)

      /* Broadcast Transaction */
      insight.broadcast(tx, function(err, txid) {
        if(err) return cb('[insight.broadcast]: '+err);

console.log("Chunk "+seq+" sent. [Tx: " + txid+"]");
        senttxs.push({seq:seq,txid:txid})

        /* Iterate on chunks */
        if(seq == chunks.length-1){
          return cb(null, senttxs)
        }
        else /* Send next chunk */
          setTimeout(sendMsgTransaction(seq+1, cb), 1000)
      });
    })//getUnspentUtxos
  }//sendMsgTransaction

  /* Check if there are enough funds to send the whole message */
  insight.getUnspentUtxos(srcAddr, function(err, utxos){
    if(err) return callback("[insight.getUnspentUtxos]: "+err);

    var balance = 0
    for (var i = 0; i < utxos.length; i++)
      balance +=utxos[i]['satoshis'];
    if(balance < (2*MIN_AMOUNT*chunks.length))
      return callback("[BM]: not enough funds to send message");

    try{
      sendMsgTransaction(0, function(err, res){
        if(err) callback(err)
        return callback(null, res)
      })
    }catch(e){return callback(e)}
  });
}

/* Returns all messages sent and received by a node */
var getBMMessages = function(address, node, callback){
  var msgs = []

  node.getAddressHistory(address, {queryMempool: true}, function(err, res){
    if(err) return callback(e)

    var txs = res.items
    var chnkBuf = {}
    /* For each transaction, check and extract any embedded BM message */
    for(var i=0; i<txs.length; i++){
      var tx = bitcore.Transaction().fromObject(txs[i].tx);
      var src = tx.inputs[0].script.toAddress(node.network);
      var dst = tx.outputs[0].script.toAddress(node.network);
      var msgid = src+dst

      var txMsg = getMessage(tx)
      if(txMsg){
        if(!chnkBuf[msgid]) chnkBuf[msgid] = new Array(txMsg.len)

        chnkBuf[msgid][txMsg.seq] = {msg:txMsg.msg, txid:tx.hash}
        /* Check if we have all chunks */
        var complete = true
        for(var j=0; j<txMsg.len; j++)
          if(!chnkBuf[msgid][j]) complete = false;

        if(complete){
          //TODO: replace with assembleChunks ?
          var msg = ""
          var msgtxs = []
          for(var j=0; j<txMsg.len; j++){

            msg += chnkBuf[msgid][j].msg
            msgtxs.push(chnkBuf[msgid][j].txid)
          }

          /* Add msg to result */
          // var src = self.bmnet.isBMNodeAddr(srcAddr) ? self.bmnet.getNodeID(srcAddr) : srcAddr
          // var dst = self.bmnet.isBMNodeAddr(dstAddr) ? self.bmnet.getNodeID(dstAddr) : dstAddr
          msgs.push({'txs':msgtxs, 'src':src, 'dst':dst, 'data':msg}); //TODO: add timestamp/height

          delete chnkBuf[msgid]
        }//if(complete)
      }//if(txMsg)
    }

    return callback(null, msgs)
  })
}

var getBMNodeStatus = function(address, insight, callback){
  insight.getUnspentUtxos(address, function(err, utxos){
    if(err) callback("[insight.getUnspentUtxos] "+err);

    var funds = 0
    for(var utxo in utxos)
      funds+=utxo.amount
    var status = {
      "Address": address,
      "Funds": funds,
      "Messages": null,  //TODO: add messages (num received, num sent)
    }
    callback(null, status)
  });
}

/**/
module.exports = {
  isBMTransaction: isBMTransaction,
  getMessage: getBMMessage,
};

/*__________ BitMEx Class __________*/
/* Constructor */
function BitMEx(bms, options){
  if(!bms) throw "ERR: BitMEx requires a Bitcore Node instance"

  // EventEmitter.call(this, options);
  this.bms = bms;
  this.msgDB = {}

  //TODO: if(!options.name) genBMName
  // this.name = options.name
  //TODO: if(!options.dir) genBMName
  // this.dir = options.dir

  /* Load existing network  or create a new one */
  this.bmnet = new BMNet(this.bms, options.name, options.dir)
}

/*__________ NODES __________*/
/* Creates a new node */
/**
 Will return the ID of the new node
 @param {String} id - ID for the new node
 */
BitMEx.prototype.createNode = function(id){
  if(!id) throw "ERR: Missing ID"
if(DBG) this.log("Creating new node")

  var nodeID = this.bmnet.addBMNode({id}, MODE.NEW)

  return nodeID
}

/* [API] Adds a new node to a BM network. Requires PrivateKey */
BitMEx.prototype.addNode = function(options){
  if(!options) options = {}
  this.bmnet.addBMNode({id:options.id, pk:options.privKey}, options.mode)
}

/* [API] Deletes a node */
BitMEx.prototype.removeNode = function(id){
  if(!id || !this.bmnet.isBMNodeID(id)) throw "ERR: Invalid ID"

  this.bmnet.removeBMNode(id)
}

/* Returns the status of a node */
BitMEx.prototype.getNodeStatus = function(id, callback){
  if(!this.bmnet.isBMNodeID(id)) return callback("ERR: Invalid ID")

  var addr = this.bmnet.getNodeAddress(id)
  getBMNodeStatus(addr, this.bms.insight, callback)
}

/* Returns the BM messages of a node */
BitMEx.prototype.getNodeMessages = function(id, callback){
  var nodeAddr = this.bmnet.getNodeAddress(id)

  try {
    getBMMessages(nodeAddr, this.bms.node, callback)
  } catch (e) { return callback(e) }
}

/*__________ SENDER FUNCTIONS __________*/
/* Send a message */
BitMEx.prototype.sendMessage = function(src, dst, msg, callback){
if(DBG) this.log("sending \'"+msg+"\' from "+src+" to "+dst);

  /* Check src and dst */
  var srcAddr = this.bmnet.getNodeAddress(src)
  if(!srcAddr) throw "ERR: invalid source"
  var dstAddr = this.bmnet.getNodeAddress(dst)
  if(!dstAddr)
    if(isValidAddr(dst, this.bms.node.network))
      dstAddr = dst
    else throw "ERR: invalid destination"

  var msgData = {
    src: srcAddr,
    dst: dstAddr,
    msg: msg,
    pk: this.bmnet.getNode(src).getPrivKey()
  }
  sendBMMessage(msgData, this.bms.node.network, this.bms.insight, callback)
}

/*__________ RECEIVER FUNCTIONS __________*/
/* Handles received transactions */
BitMEx.prototype.handleTransaction = function(tx) {
  if(isBMTransaction(tx)){
if(DBG) this.log("New BM transaction ["+tx.id+"]");
    var src = tx.inputs[0].script.toAddress(this.bms.node.network);
    var dst = tx.outputs[0].script.toAddress(this.bms.node.network);

    var msgsplit = tx.outputs[1].script.toString().split(" ")
    var data = hexToAscii(msgsplit[msgsplit.length-1])

    if(this.bmnet.isBMNodeAddr(dst))
      this.collectMessage(src, dst, data)
  }//if(isBMTransaction)
}//transactionHandler()

/* Collects received chunks */
//TODO: handle multiple messages from A to B. Add Msg ID/timestamp?
BitMEx.prototype.collectMessage = function (src, dst, data){
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
BitMEx.prototype.deliverMessage = function(src, dst, data){
  var message = {src:src, dst:dst, data:data}

  /* Emits 'newmessage' event notifications to BM Nodes */
  for(var i = 0; i < this.subscriptions.newmessage.length; i++)
    this.bms.subscriptions.newmessage[i].emit('bmservice/newmessage', message);
}

/*__________ LOG __________*/
BitMEx.prototype.log = function(msg){
  return BMutils.log('BM', msg)
}

module.exports = BitMEx;
