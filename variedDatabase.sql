DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS deliveries;

CREATE TABLE customers(
  id SERIAL PRIMARY KEY,
  delivery_address TEXT,
  delivery_unit TEXT,
  delivery_zipcode TEXT,
  delivery_latlong TEXT,
  contact_number TEXT,
  customer_name TEXT
);

CREATE TABLE orders(
  id SERIAL PRIMARY KEY,
  order_date DATE,
  customer_id INT,
  product_model_id INT,
  preferences TEXT,
  admin_staff_id INT,
  created_on TEXT,
  assigned BOOLEAN
);


CREATE TABLE deliveries(
 id SERIAL PRIMARY KEY,
 date DATE,
 orders_id INT,
 delivery_staff_id INT,
 position INT,
 completed BOOLEAN
);