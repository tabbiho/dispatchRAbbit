import jsSHA from 'jssha';

const password = 'admin1';

// eslint-disable-next-line new-cap
const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
shaObj.update(`${password}-fishbones`);
const hash = shaObj.getHash('HEX');

console.log(hash);
