const bcrypt = require('bcrypt');

bcrypt.hash('Didi25', 10).then(hash => {
  console.log('Hash généré :', hash);
});
