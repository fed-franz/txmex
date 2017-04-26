const bitcore = require('bitcore-lib')
const explorers = require('bitcore-explorers');

const Networks = bitcore.Networks
const tBTC = Networks.testnet
const BTC = Networks.livenet

const TX_PREFIX = "BM"
const MAX_PAYLOAD_SIZE = 76
const MIN_AMOUNT = bitcore.Transaction.DUST_AMOUNT
const MIN_FEE = 5000//2667

const BMutils = require('./BMutils');
const MODE = BMutils.MODE
const hexToAscii = BMutils.hexToAscii
const isValidAddr = BMutils.isValidAddr
const DBG = BMutils.DBG

/* Extract embedded data from TX output */
/**
 * @param {bitcore.Transaction} tx
 * @param {Number} index - index of transaction output to extract data from
 */
var _getTxData = function(tx, index){
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
  var data = _getTxData(tx, 2)
  if(!data) return false

  /* Verify BM prefix */
  var BMcode = data.substring(0,3)
  if(BMcode.localeCompare(TX_PREFIX) != 0) return false

  return true
}//isBMTransaction()

/* Extract the embedded message (if any) */
var extractBMMessage = function(tx){
  if(tx.tx) tx = tx.tx

  if(!isBMTransaction(tx)) return null

  var msgsplit = tx.outputs[1].script.toString().split(" ")
  var data = hexToAscii(msgsplit[msgsplit.length-1])

  var msglen = parseInt(data.charAt(3), 16);
  var msgseq = parseInt(data.charAt(4), 16);
  var msg = data.slice(5)

  return {'seq':msgseq, 'len':msglen, 'msg':msg}
}

/* Send a BitMEx message */
var sendBMMessage = function(msgData, callback){
  if(DBG) console.log("[BitMEx] sendBMMessage");
  var srcAddr = msgData.src
  var dstAddr = msgData.dst
  var msg = msgData.msg
  var privKey = msgData.pk

  var network = BMutils.getBTCNetwork(srcAddr)
  var insight = new explorers.Insight(network)
  /* Check src and dst */
  if(!isValidAddr(srcAddr, network) || !isValidAddr(dstAddr, network))
    return callback("Invalid address")

  /* Split message in chunks */
  var chunks = BMutils.chunkMessage(msg, MAX_PAYLOAD_SIZE)

  /* Function to send a transaction with an embedde message chunk */
  var senttxs = []
  //TODO: put seq here
  var sendMsgTransaction = function(seq, cb){
    if(DBG) console.log("sendMsgTransaction "+seq);
    /* Get UTXOs to fund new transaction */
    insight.getUnspentUtxos(srcAddr, function(err, utxos){
      if(DBG) console.log("getUnspentUtxos");
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
      tx.fee(MIN_FEE) // tx.fee(tx.getFee())

      /* Let the node sign the transaction */
      try{
        tx.sign(privKey)
      } catch(e){ return cb(e) }

      //TODO: verify serialization errors ?

      /* Broadcast Transaction */
      try{
        insight.broadcast(tx, function(err, txid){
          if(err) return cb('[insight.broadcast]: '+err+tx);

          senttxs.push(txid)

          /* Iterate on chunks */
          if(seq == chunks.length-1){
            return cb(null, senttxs)
          }
          else /* Send next chunk */
          setTimeout(sendMsgTransaction(seq+1, cb), 500)
        });
      } catch(e){ return cb(e) }
    })//getUnspentUtxos
  }//sendMsgTransaction

  /* Check if there are enough funds to send the whole message */
  BMutils.getBTCAddrBalance(srcAddr, function(err, balance){
    if(err) return callback("[getBTCAddrBalance]: "+err);

    if(balance < ((MIN_AMOUNT+MIN_FEE)*chunks.length))
      return callback("Not enough funds to send message");

    try{
      sendMsgTransaction(0, function(err, res){
        if(err) return callback(err)
        return callback(null, res)
      })
    }catch(e){return callback(e)}
  })
}

/* Returns all messages sent and received by a node */
//TODO: create new node dynamically?
var getBMMessages = function(address, node, callback){
  var msgs = []

  node.getAddressHistory(address, {queryMempool: true}, function(err, res){
    if(err) return callback(e)

    var txs = res.items
    var chnkBuf = {}
    /* For each transaction, check and extract any embedded BM message */
    for(var i=0; i<txs.length; i++){
      var tx = bitcore.Transaction().fromObject(txs[i].tx);
      var src = tx.inputs[0].script.toAddress(node.network).toString();
      var dst = tx.outputs[0].script.toAddress(node.network).toString();
      var msgid = src+dst

      /* Exctract message (if any) */
      var txMsg = extractBMMessage(tx)
      if(txMsg){
        if(!chnkBuf[msgid]) chnkBuf[msgid] = new Array(txMsg.len)

        /* Add chunk to buffer */
        chnkBuf[msgid][txMsg.seq] = {msg:txMsg.msg, txid:tx.hash}

        /* Check if we have all chunks */
        var complete = true
        for(var j=0; j<txMsg.len; j++)
          if(!chnkBuf[msgid][j]) complete = false;

        if(complete){
          var msg = ""
          var msgtxs = []
          for(var j=0; j<txMsg.len; j++){
            /* Assemble message */
            msg += chnkBuf[msgid][j].msg
            /* Add txid to the list */
            msgtxs.push(chnkBuf[msgid][j].txid)
          }

          /* Add msg to result */
          var msgData = {
            'src':src,
            'dst':dst,
            'data':msg,
            'txs':msgtxs,
            //TODO: add timestamp/height
          }
          msgs.push(msgData);

          delete chnkBuf[msgid]
        }//if(complete)
      }//if(txMsg)
    }

    return callback(null, msgs)
  })
}

/* Returns the current status of a node */
var getBMNodeStatus = function(address, callback){
  var network = BMutils.getBTCNetwork(address)
  insight = new explorers.Insight(network)

  BMutils.getBTCAddrBalance(address, function(err, balance){
    if(err) return callback("[getBTCAddrBalance] "+err);

    var status = {
      "Address": address,
      "Balance": balance+"("+(balance/(MIN_AMOUNT+MIN_FEE))+" messages can be sent, approximately)",
    }

    return callback(null, status)
  });
}

/* Module exports */
module.exports = {
  getBMNodeStatus: getBMNodeStatus,
  isBMTransaction: isBMTransaction,
  extractBMMessage: extractBMMessage,
  getBMMessages: getBMMessages,
  sendBMMessage: sendBMMessage,
};
