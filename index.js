import express from 'express';
import pg from 'pg';
import moment from 'moment';
import methodOverride from 'method-override';
import axios from 'axios';
import jsSHA from 'jssha';
import cookieParser from 'cookie-parser';

const { Pool } = pg;

const pgConnectionConfigs = {
  user: 'tabithan',
  host: 'localhost',
  database: 'dispatchrabbit',
  port: 5432,
};

// Valid till Thurs morning ***
const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjg0NzgsInVzZXJfaWQiOjg0NzgsImVtYWlsIjoidGFiYmlob0BnbWFpbC5jb20iLCJmb3JldmVyIjpmYWxzZSwiaXNzIjoiaHR0cDpcL1wvb20yLmRmZS5vbmVtYXAuc2dcL2FwaVwvdjJcL3VzZXJcL3Nlc3Npb24iLCJpYXQiOjE2NDY2MDc5OTAsImV4cCI6MTY0NzAzOTk5MCwibmJmIjoxNjQ2NjA3OTkwLCJqdGkiOiI3ZTc5ODRjM2MwYjg0NGJjZTI3ZmFkNGY0YTg4YjhlNSJ9.J88C8SiY6fDHbfAbjMiLnG-QCKw-FmkcADH13-aK2lY';

const officeLatLong = '1.3504812534505,103.848760473211';
const SALT = 'fishbones';

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(methodOverride('_method'));
app.use(cookieParser());

const pool = new Pool(pgConnectionConfigs);
pool.connect();

const getHash = (input) => {
  // eslint-disable-next-line new-cap
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  shaObj.update(`${input}-${SALT}`);
  return shaObj.getHash('HEX');
};

app.use((request, response, next) => {
  request.isUserLoggedIn = false;
  if (request.cookies.loggedIn === getHash(`${request.cookies.user}${request.cookies.permission}`)) {
    request.isUserLoggedIn = true;
  }
  next();
});

app.get('/login', (request, response) => {
  if (request.isUserLoggedIn && request.cookies.permission) {
    if (request.cookies.permission === 'A') {
      response.redirect('/adminHome');
      return;
    } if (request.cookies.permission === 'D') {
      response.redirect('/deliveryHomepage');
      return;
    }
  }
  response.render('login');
});

app.post('/adminLogin', (request, response) => {
  const adminQuery = 'SELECT email, hashed_pw FROM users WHERE admin_rights=true';
  pool.query(adminQuery)
    .then((res) => {
      const input = request.body;
      let login = false;

      const hash = getHash(input.adminPW);

      res.rows.forEach((x) => {
        if (x.email === input.adminEmail && x.hashed_pw === hash) {
          login = true;
          response.cookie('user', `${x.email}`);
          response.cookie('permission', 'A');
          response.cookie('loggedIn', getHash(`${x.email}A`));
        }
      });

      if (login) {
        response.redirect('/adminHome');
      } else {
        response.redirect('/loginError');
      }
    });
});

app.post('/deliveryLogin', (request, response) => {
  const deliveryQuery = 'SELECT email, hashed_pw FROM users WHERE admin_rights=false';
  pool.query(deliveryQuery)
    .then((res) => {
      const input = request.body;
      let login = false;

      const hash = getHash(input.deliveryPW);

      res.rows.forEach((x) => {
        if (x.email === input.deliveryEmail && x.hashed_pw === hash) {
          login = true;
          response.cookie('user', `${x.email}`);
          response.cookie('permission', 'D');
          response.cookie('loggedIn', getHash(`${x.email}D`));
        }
      });

      if (login) {
        response.redirect('/deliveryHome');
      } else {
        response.redirect('/loginError');
      }
    });
});

app.get('/loginError', (request, response) => {
  response.render('loginError');
});

const createOrderDateTally = (arr) => {
  const tally = {};
  arr.forEach((x) => {
    if (x.order_date in tally) {
      tally[x.order_date] += 1;
    } else {
      tally[x.order_date] = 1;
    }
  });
  return tally;
};

app.get('/adminHome', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  const data = {};
  const promiseArr = [];
  const unassignedQuery = 'SELECT * FROM orders WHERE assigned=false ORDER BY order_date ASC';
  promiseArr.push(pool.query(unassignedQuery));

  const assignedQuery = 'SELECT COUNT (*) FROM deliveries WHERE date=$1';
  for (let i = 0; i < 3; i += 1) {
    const assignedValue = [moment().add(i, 'days').format('YYYY-MM-DD')];
    promiseArr.push(pool.query(assignedQuery, assignedValue));
  }
  Promise.all(promiseArr).then((res) => {
    const assignedData = [];
    const dates = [];
    const datesQueryFormat = [];
    for (let i = 1; i < res.length; i += 1) {
      assignedData.push(res[i].rows[0].count);
      dates.push(moment().add(i - 1, 'days').format('Do MMM YYYY'));
      datesQueryFormat.push(moment().add(i - 1, 'days').format('YYYY-MM-DD'));
    }
    data.dates = dates;
    data.assignedData = assignedData;
    data.datesQueryFormat = datesQueryFormat;
    res[0].rows.forEach((x) => {
      x.order_date = moment(x.order_date).format('Do MMM YYYY');
    });
    data.unassigned = createOrderDateTally(res[0].rows);

    const promiseArr2 = [];
    promiseArr2.push(pool.query(`SELECT name FROM users WHERE email='${request.cookies.user}'`));
    const completedQuery = 'SELECT COUNT (*) FROM deliveries WHERE date=$1 AND completed=true';

    data.datesQueryFormat.forEach((x) => {
      const completedValue = [x];
      promiseArr2.push(pool.query(completedQuery, completedValue));
    });

    return Promise.all(promiseArr2);
  }).then((res) => {
    data.loggedIn = res[0].rows[0].name;
    data.completed = [];
    for (let i = 1; i < res.length; i += 1) {
      data.completed.push(res[i].rows[0].count);
    }
    response.render('adminHome', data);
  });
});

app.post('/scheduleView', (request, response) => {
  response.redirect(`/scheduleView/${moment(request.body.viewDate).format('YYYY-MM-DD')}`);
});

app.get('/scheduleView/:date', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  const dateQuery = `SELECT deliveries.completed, users.name, customers.delivery_address, product_models.model_number
  FROM deliveries
  INNER JOIN orders ON deliveries.orders_id=orders.id
  INNER JOIN users ON users.id=delivery_staff_id
  INNER JOIN customers ON customers.id=orders.customer_id
  INNER JOIN product_models ON orders.product_model_id=product_models.id
   WHERE deliveries.date=$1 ORDER BY deliveries.position ASC`;
  const dateValue = [request.params.date];
  const deliveryStaffQuery = 'SELECT name FROM users WHERE admin_rights=false';
  Promise.all([pool.query(dateQuery, dateValue), pool.query(deliveryStaffQuery)])
    .then((res) => {
      const perStaffDeliveries = {};
      const data = {};
      data.staff = [];
      res[1].rows.forEach((x) => {
        perStaffDeliveries[x.name] = [];
        data.staff.push(x.name);
      });
      res[0].rows.forEach((x) => {
        perStaffDeliveries[x.name].push(x);
      });
      data.date = moment(request.params.date).format('Do MMM YYYY');
      data.deliveries = perStaffDeliveries;
      response.render('scheduleView', data);
    });
});

app.get('/orderZip', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  response.render('orderZip');
});

app.post('/orderZip', (request, response) => {
  const { zipcode } = request.body;
  response.redirect(`/order?zipcode=${zipcode}`);
});

app.get('/order', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  axios
    .get(`https://developers.onemap.sg/commonapi/search?searchVal=${request.query.zipcode}&returnGeom=Y&getAddrDetails=Y`)
    .then((callRes) => {
      if (callRes.data.results.length !== 0) {
        const sqlQuery = 'SELECT * FROM product_models';
        pool.query(sqlQuery, (err, result) => {
          response.render('order', {
            zipData: callRes.data.results[0],
            modelsData: result.rows,
            date: moment().format('YYYY-MM-DD'),
          });
        });
      } else {
        response.redirect('/addressError');
      }
    });
});

app.get('/addressError', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  response.render('addressError');
});

app.post('/order', (request, response) => {
  const customerQuery = 'INSERT INTO customers(delivery_address, delivery_unit, delivery_zipcode, delivery_latlong, contact_number, customer_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id';
  const customerValues = Object.values(request.body).slice(0, 6);
  pool.query(customerQuery, customerValues)
    .then(
      (customerResponse) => {
        const modelQuery = 'INSERT INTO orders(order_date, customer_id, product_model_id, preferences, admin_staff_id, created_on, assigned) VALUES ($1, $2, $3, $4, $5, $6, $7)';
        const currentCustomer = customerResponse.rows[0].id;
        const createdTime = moment().format();
        if (!Array.isArray(request.body.model)) {
          request.body.model = [request.body.model];
        }
        request.body.model.forEach((x) => {
          // eslint-disable-next-line max-len
          const modelValues = [request.body.orderDate, currentCustomer, x, request.body.preference, 1, createdTime, false];
          pool.query(modelQuery, modelValues);
        });
      },
    ).then(() => {
      setTimeout(() => response.redirect('/adminHome'), 500);
    });
});

app.get('/scheduler', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  const ordersQuery = `
  SELECT orders.id, orders.order_date, orders.assigned, product_models.model_number, customers.delivery_address, deliveries.completed
  FROM orders
  INNER JOIN product_models ON orders.product_model_id=product_models.id
  INNER JOIN customers ON orders.customer_id=customers.id
  LEFT JOIN deliveries ON deliveries.orders_id=orders.id`;
  pool.query(ordersQuery).then(
    (res) => {
      response.render('scheduler', { orders: res.rows, moment });
    },
  );
});

const addOfficeStartEnd = (arr) => {
  arr.unshift(officeLatLong);
  arr.push(officeLatLong);
  return arr;
};

const minutesToHrsMinsString = (minutes) => {
  const hr = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hr} Hr ${min} Min`;
};

app.get('/scheduler/assign/:orders_id', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  const deliveryStaffQuery = 'SELECT id, name FROM users WHERE admin_rights=false';
  const orderQuery = `
  SELECT orders.id, customers.delivery_address, customers.delivery_latlong
  FROM orders
  INNER JOIN customers ON orders.customer_id=customers.id
  WHERE orders.id=$1`;
  const orderValue = [request.params.orders_id];
  const data = {};
  Promise.all([
    pool.query(deliveryStaffQuery),
    pool.query(orderQuery, orderValue),
  ]).then(
    (res) => {
      data.deliveryStaff = res[0].rows;
      // eslint-disable-next-line prefer-destructuring
      data.order = res[1].rows[0];

      data.displaySchedule = false;
      if (request.query.staff && request.query.date) {
        data.selectedDate = request.query.date;
        data.displayDate = moment(request.query.date).format('Do MMM YYYY');
        data.displaySchedule = true;
        res[0].rows.forEach((x) => {
          if (x.id === Number(request.query.staff)) {
            data.selectedStaff = x.name;
            data.selectedStaffID = x.id;
          }
        });
      }

      const retrieveStaffDeliveryQuery = `
      SELECT customers.delivery_latlong, customers.delivery_address
      FROM deliveries
      INNER JOIN orders ON deliveries.orders_id=orders.id
      INNER JOIN customers ON orders.customer_id=customers.id
      WHERE deliveries.delivery_staff_id=$1 AND deliveries.date=$2`;
      const retrieveStaffValue = [request.query.staff, request.query.date];
      return pool.query(retrieveStaffDeliveryQuery, retrieveStaffValue);
    },
  ).then(
    (res) => {
      const deliveryArr = [];
      const addressArr = [];
      res.rows.forEach((x) => {
        deliveryArr.push(x.delivery_latlong);
        addressArr.push(x.delivery_address);
      });
      data.deliveryCount = res.rows.length;
      if (!request.query.position) {
        deliveryArr.push(data.order.delivery_latlong);
        addressArr.push(data.order.delivery_address);
        data.currentPosition = res.rows.length;
      } else {
        deliveryArr.splice(request.query.position, 0, data.order.delivery_latlong);
        addressArr.splice(request.query.position, 0, data.order.delivery_address);
        data.currentPosition = Number(request.query.position);
      }
      addOfficeStartEnd(deliveryArr);
      data.addresses = addressArr;
      const arr = [];
      for (let i = 0; i < deliveryArr.length - 1; i += 1) {
        arr.push(axios.get(`https://developers.onemap.sg/privateapi/routingsvc/route?start=${deliveryArr[i]}&end=${deliveryArr[i + 1]}&routeType=drive&token=${token}`));
      }
      return Promise.all(arr);
    },
  ).then((res) => {
    const travelTimes = [];
    res.forEach((x) => {
      travelTimes.push(Math.ceil(x.data.route_summary.total_time / 60));
    });
    let installTime = 0;
    for (let i = 0; i < res.length - 1; i += 1) {
      installTime += 30;
    }
    const totalTime = travelTimes.reduce((a, b) => a + b, 0) + installTime;
    const totalTimeString = minutesToHrsMinsString(totalTime);
    data.time = { travelTimes, totalTimeString };
    response.render('schedulerOrder', data);
  });
});

app.post('/scheduler/assign/:orders_id', (request, response) => {
  const content = request.body;
  const higherPositionQuery = 'SELECT id, position FROM deliveries WHERE position>=$1 AND date=$2';
  const higherPositionValue = [content.position, content.date];
  pool.query(higherPositionQuery, higherPositionValue)
    .then((res) => {
      const promiseArr = [];
      const incrementPositionQuery = 'UPDATE deliveries SET position=$1 WHERE id=$2';
      res.rows.forEach((x) => {
        const newPosition = x.position + 1;
        const incrementPositionValue = [newPosition, x.id];
        promiseArr.push(pool.query(incrementPositionQuery, incrementPositionValue));
      });
      const assignQuery = 'INSERT INTO deliveries (date, orders_id, delivery_staff_id, position) VALUES ($1, $2, $3, $4)';
      // eslint-disable-next-line max-len
      const assignValue = [content.date, request.params.orders_id, content.staffID, content.position];
      promiseArr.push(pool.query(assignQuery, assignValue));

      const orderSetAssignedQuery = 'UPDATE orders SET assigned=true WHERE id=$1';
      const orderSetAssignedValue = [request.params.orders_id];
      promiseArr.push(pool.query(orderSetAssignedQuery, orderSetAssignedValue));
      return Promise.all(promiseArr);
    }).then(() => {
      response.redirect('/scheduler');
    });
});

app.get('/scheduler/unassign/:orders_id', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  response.render('unassignConfirm', request.params);
});

app.delete('/scheduler/unassign/:orders_id', (request, response) => {
  const orderSetUnassignedQuery = 'UPDATE orders SET assigned=false WHERE id=$1';
  const orderSetUnassignedValue = [request.params.orders_id];

  const positionQuery = 'SELECT position,date FROM deliveries WHERE orders_id=$1';
  const positionValue = [request.params.orders_id];

  Promise.all(
    [pool.query(orderSetUnassignedQuery, orderSetUnassignedValue),
      pool.query(positionQuery, positionValue)],
  ).then((res) => {
    const higherPositionQuery = 'SELECT id, position FROM deliveries WHERE position>$1 AND date=$2';
    const higherPositionValue = [res[1].rows[0].position, res[1].rows[0].date];
    return pool.query(higherPositionQuery, higherPositionValue);
  }).then((res) => {
    const promiseArr = [];
    if (res.rows.length !== 0) {
      const decrementPositionQuery = 'UPDATE deliveries SET position=$1 WHERE id=$2';
      res.rows.forEach((x) => {
        const newPosition = x.position - 1;
        const decrementPositionValue = [newPosition, x.id];
        promiseArr.push(pool.query(decrementPositionQuery, decrementPositionValue));
      });
    }
    const finalDeletionQuery = 'DELETE FROM deliveries WHERE orders_id=$1';
    const finalDeletionValue = [request.params.orders_id];
    promiseArr.push(pool.query(finalDeletionQuery, finalDeletionValue));
    return Promise.all(promiseArr);
  }).then(() => {
    response.redirect('/scheduler');
  });
});

app.get('/ordersList', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  const unassignedQuery = `
  SELECT orders.id, orders.order_date, product_models.model_number, customers.customer_name
  FROM orders 
  INNER JOIN product_models ON orders.product_model_id=product_models.id
  INNER JOIN customers ON orders.customer_id=customers.id
  WHERE orders.assigned=false ORDER BY orders.order_date ASC`;
  const assignedQuery = `
  SELECT orders.id, orders.order_date, product_models.model_number, customers.customer_name, deliveries.completed
  FROM orders 
  INNER JOIN product_models ON orders.product_model_id=product_models.id
  INNER JOIN customers ON orders.customer_id=customers.id
  LEFT JOIN deliveries ON deliveries.orders_id=orders.id
  WHERE orders.assigned=true ORDER BY orders.id DESC`;

  Promise.all(
    [pool.query(unassignedQuery),
      pool.query(assignedQuery)],
  ).then((allResults) => {
    const data = { unassigned: allResults[0].rows, assigned: allResults[1].rows, moment };
    response.render('allOrders', data);
  });
});

app.get('/ordersList/:orders_id', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  const currentOrder = request.params.orders_id;
  const orderQuery = `
  SELECT orders.id, orders.order_date, orders.preferences, orders.admin_staff_id, orders.created_on, product_models.model_number, product_models.dimensions_lwh, product_models.weight_kg, product_models.retail_price, customers.delivery_address, customers.delivery_unit, customers.delivery_zipcode, customers.contact_number, customers.customer_name
  FROM orders
  INNER JOIN product_models ON orders.product_model_id=product_models.id
  INNER JOIN customers ON orders.customer_id=customers.id
  WHERE orders.id=${currentOrder}`;
  pool.query(orderQuery)
    .then((orderResponse) => {
      const data = { order: orderResponse.rows[0], moment };
      response.render('indivOrder', data);
    });
});

app.get('/ordersList/edit/:orders_id', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  const currentOrder = request.params.orders_id;
  const orderQuery = `
  SELECT orders.id, orders.order_date, orders.preferences, product_models.model_number, customers.id AS customers_id, customers.delivery_unit, customers.delivery_zipcode, customers.contact_number, customers.customer_name
  FROM orders
  INNER JOIN product_models ON orders.product_model_id=product_models.id
  INNER JOIN customers ON orders.customer_id=customers.id
  WHERE orders.id=${currentOrder}`;
  Promise.all([pool.query(orderQuery), pool.query('SELECT * FROM product_models')])
    .then((responseArr) => {
      const data = { order: responseArr[0].rows[0], modelsData: responseArr[1].rows, moment };
      response.render('edit', data);
    });
});

app.put('/ordersList/edit/:orders_id', (request, response) => {
  const content = request.body;
  const orderQuery = 'UPDATE orders SET order_date=$1, product_model_id=$2, preferences=$3 WHERE id=$4';
  // eslint-disable-next-line max-len
  const orderData = [content.orderDate, content.model, content.preference, request.params.orders_id];
  const customerQuery = 'UPDATE customers SET customer_name=$1, contact_number=$2, delivery_zipcode=$3, delivery_unit=$4 WHERE id=$5';
  // eslint-disable-next-line max-len
  const customerData = [content.customerName, content.contactNumber, content.zipcode, content.unit, content.customerID];
  Promise.all(
    [pool.query(orderQuery, orderData),
      pool.query(customerQuery, customerData),
      axios.get(`https://developers.onemap.sg/commonapi/search?searchVal=${content.zipcode}&returnGeom=Y&getAddrDetails=Y`)],
  )
    .then((res) => {
      const addDetails = res[2].data.results[0];
      const zipQuery = 'UPDATE customers SET delivery_address=$1, delivery_latlong=$2 WHERE id=$3';
      const zipData = [addDetails.ADDRESS, `${addDetails.LATITUDE},${addDetails.LONGITUDE}`, content.customerID];
      return pool.query(zipQuery, zipData);
    }).then(() => {
      response.redirect(`/ordersList/${request.params.orders_id}`);
    });
});

app.get('/ordersList/remove/:orders_id', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'A') {
    response.redirect('/login');
    return;
  }
  response.render('deletionConfirm', request.params);
});

app.delete('/ordersList/remove/:orders_id', (request, response) => {
  const customerIDQuery = 'SELECT customer_id FROM orders WHERE id=$1';
  const customerIDValue = [request.params.orders_id];
  let currentCustomerID;
  pool.query(customerIDQuery, customerIDValue).then(
    (res) => {
      const customerCountQuery = 'SELECT COUNT (*) FROM orders WHERE customer_id=$1';
      const customerCountValue = [res.rows[0].customer_id];
      currentCustomerID = res.rows[0].customer_id;
      return pool.query(customerCountQuery, customerCountValue);
    },
  ).then((res) => {
    if (res.rows[0].count === '1')
    { const customerDeletionQuery = 'DELETE FROM customers WHERE id=$1';
      const customerDeletionValue = [currentCustomerID];
      pool.query(customerDeletionQuery, customerDeletionValue);
    }
    const orderRemoveQuery = 'DELETE FROM orders WHERE id=$1';
    const orderRemoveData = [request.params.orders_id];
    return pool.query(orderRemoveQuery, orderRemoveData);
  }).then(() => {
    response.redirect('/ordersList');
  });
});

app.get('/deliveryHome', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'D') {
    response.redirect('/login');
    return;
  }
  const data = {};
  const userQuery = 'SELECT id, name FROM users WHERE email=$1';
  const userData = [request.cookies.user];
  pool.query(userQuery, userData).then((res) => {
    data.loggedIn = res.rows[0].name;

    const promiseArr = [];
    const deliveryQuery = 'SELECT COUNT (*) FROM deliveries WHERE delivery_staff_id=$1 AND date=$2';
    for (let i = 0; i < 3; i += 1) {
      const deliveryValue = [res.rows[0].id, moment().add(i, 'days').format('YYYY-MM-DD')];
      promiseArr.push(pool.query(deliveryQuery, deliveryValue));
    }
    return Promise.all(promiseArr);
  }).then((res) => {
    data.assignedData = [];
    data.dates = [];
    for (let i = 0; i < res.length; i += 1) {
      data.assignedData.push(res[i].rows[0].count);
      data.dates.push(moment().add(i, 'days').format('Do MMM YYYY'));
    }
    response.render('deliveryHome', data);
  });
});

app.get('/deliveryAssigned', (request, response) => {
  if (!request.isUserLoggedIn || request.cookies.permission !== 'D') {
    response.redirect('/login');
    return;
  }
  const data = {};
  const viewDate = request.query.view ? request.query.view : moment().format('YYYY-MM-DD');
  data.queryDate = viewDate;
  data.viewDate = moment(viewDate).format('Do MMM YYYY');
  const assignedQuery = `
  SELECT product_models.model_number, orders.preferences, customers.delivery_address, customers.delivery_unit, customers.delivery_latlong, customers.contact_number, customers.customer_name, deliveries.id, deliveries.completed
  FROM deliveries
  INNER JOIN orders ON deliveries.orders_id=orders.id
  INNER JOIN customers ON orders.customer_id=customers.id
  INNER JOIN users ON deliveries.delivery_staff_id=users.id
  INNER JOIN product_models ON orders.product_model_id=product_models.id
  WHERE deliveries.date=$1 AND users.email=$2
  ORDER BY deliveries.position ASC
  `;
  const assignedValue = [viewDate, request.cookies.user];
  pool.query(assignedQuery, assignedValue).then((res) => {
    data.orders = res.rows;
    const deliveriesRoute = [];
    res.rows.forEach((x) => {
      deliveriesRoute.push(x.delivery_latlong);
    });
    addOfficeStartEnd(deliveriesRoute);

    const promiseArr = [];
    for (let i = 0; i < deliveriesRoute.length - 1; i += 1) {
      promiseArr.push(axios.get(`https://developers.onemap.sg/privateapi/routingsvc/route?start=${deliveriesRoute[i]}&end=${deliveriesRoute[i + 1]}&routeType=drive&token=${token}`));
    }
    return Promise.all(promiseArr);
  }).then((res) => {
    const travelTimes = [];
    res.forEach((x) => {
      travelTimes.push(Math.ceil(x.data.route_summary.total_time / 60));
    });
    let installTime = 0;
    for (let i = 0; i < res.length - 1; i += 1) {
      installTime += 30;
    }
    const totalTime = travelTimes.reduce((a, b) => a + b, 0) + installTime;
    const totalTimeString = minutesToHrsMinsString(totalTime);
    data.time = { travelTimes, totalTimeString };
    response.render('deliveryAssigned', data);
  });
});

app.post('/markComplete', (request, response) => {
  const completeQuery = 'UPDATE deliveries SET completed=true WHERE id=$1';
  const completeValue = [request.body.deliveryID];
  pool.query(completeQuery, completeValue).then(() => {
    response.redirect(`/deliveryAssigned?view=${request.body.query}`);
  });
});

app.get('/logout', (request, response) => {
  response.clearCookie('permission');
  response.clearCookie('loggedIn');
  response.clearCookie('user');
  response.redirect('/login');
});

app.listen(3004);
