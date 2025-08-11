const bcrypt = require('bcrypt');

bcrypt.hash('Fresh10', 10).then(hash => {
  console.log('Hash généré :', hash);
});
