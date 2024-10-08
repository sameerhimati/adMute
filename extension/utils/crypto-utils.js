const ENCRYPTION_KEY = 'your-secret-key'; // Store this securely, perhaps fetched from your server

export function encrypt(text) {
  const textToChars = text => text.split('').map(c => c.charCodeAt(0));
  const byteHex = n => ("0" + Number(n).toString(16)).substr(-2);
  const applySaltToChar = code => textToChars(ENCRYPTION_KEY).reduce((a,b) => a ^ b, code);

  return text.split('')
    .map(textToChars)
    .map(applySaltToChar)
    .map(byteHex)
    .join('');
}

export function decrypt(encoded) {
  const textToChars = text => text.split('').map(c => c.charCodeAt(0));
  const applySaltToChar = code => textToChars(ENCRYPTION_KEY).reduce((a,b) => a ^ b, code);
  return encoded.match(/.{1,2}/g)
    .map(hex => parseInt(hex, 16))
    .map(applySaltToChar)
    .map(charCode => String.fromCharCode(charCode))
    .join('');
}