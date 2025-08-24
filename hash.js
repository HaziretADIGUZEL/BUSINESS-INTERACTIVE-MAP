const bcrypt = require('bcryptjs');
const password = 'Hazo6942'; // Şifrenizi buraya yazın
const hash = bcrypt.hashSync(password, 10);
console.log(hash);