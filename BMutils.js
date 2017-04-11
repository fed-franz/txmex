module.exports = {
  log: log,
  hexToAscii: hexToAscii,
};


/* Prints log with BM prefix */
function log(msg){
  return console.log('[BM] '+msg);
}

/* Convert hex string to ASCII */
function hexToAscii (str1){
  var hex  = str1.toString();
  var str = '';
  for (var n = 0; n < hex.length; n += 2)
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));

  return str;
}
