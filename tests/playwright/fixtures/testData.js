const BASE_URL = 'https://www.saucedemo.com';

const USERS = {
  standard: { username: 'standard_user', password: 'secret_sauce' },
  locked: { username: 'locked_out_user', password: 'secret_sauce' },
  performance: { username: 'performance_glitch_user', password: 'secret_sauce' },
  error: { username: 'error_user', password: 'secret_sauce' },
  visual: { username: 'visual_user', password: 'secret_sauce' },
  invalid: { username: 'invalid_user', password: 'wrong_password' },
};

const PRODUCTS = {
  backpack: {
    name: 'Sauce Labs Backpack',
    price: '$29.99',
    id: 'sauce-labs-backpack',
  },
  bikeLight: {
    name: 'Sauce Labs Bike Light',
    price: '$9.99',
    id: 'sauce-labs-bike-light',
  },
  boltTShirt: {
    name: 'Sauce Labs Bolt T-Shirt',
    price: '$15.99',
    id: 'sauce-labs-bolt-t-shirt',
  },
  fleeceJacket: {
    name: 'Sauce Labs Fleece Jacket',
    price: '$49.99',
    id: 'sauce-labs-fleece-jacket',
  },
  onesie: {
    name: 'Sauce Labs Onesie',
    price: '$7.99',
    id: 'sauce-labs-onesie',
  },
  tShirtRed: {
    name: 'Test.allTheThings() T-Shirt (Red)',
    price: '$15.99',
    id: 'test.allthethings()-t-shirt-(red)',
  },
};

const CHECKOUT_INFO = {
  valid: { firstName: 'John', lastName: 'Doe', postalCode: '10001' },
  missingFirstName: { firstName: '', lastName: 'Doe', postalCode: '10001' },
  missingLastName: { firstName: 'John', lastName: '', postalCode: '10001' },
  missingPostalCode: { firstName: 'John', lastName: 'Doe', postalCode: '' },
};

const SORT_OPTIONS = {
  nameAZ: 'az',
  nameZA: 'za',
  priceLowHigh: 'lohi',
  priceHighLow: 'hilo',
};

const MESSAGES = {
  loginError: 'Epic sadface: Username and password do not match any user in this service',
  lockedError: 'Epic sadface: Sorry, this user has been locked out.',
  emptyUsername: 'Epic sadface: Username is required',
  emptyPassword: 'Epic sadface: Password is required',
  checkoutFirstName: 'Error: First Name is required',
  checkoutLastName: 'Error: Last Name is required',
  checkoutPostalCode: 'Error: Postal Code is required',
  orderComplete: 'Thank you for your order!',
  cartTitle: 'Your Cart',
  checkoutTitle: 'Checkout: Your Information',
  checkoutOverviewTitle: 'Checkout: Overview',
  checkoutCompleteTitle: 'Checkout: Complete!',
};

module.exports = { BASE_URL, USERS, PRODUCTS, CHECKOUT_INFO, SORT_OPTIONS, MESSAGES };
