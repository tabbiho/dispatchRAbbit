DROP TABLE IF EXISTS product_models;
DROP TABLE IF EXISTS users;

CREATE TABLE product_models (
id SERIAL PRIMARY KEY,
model_number TEXT,
dimensions_lwh TEXT,
weight_kg INT,
retail_price INT
);
CREATE TABLE users(
id SERIAL PRIMARY KEY,
email TEXT,
name TEXT,
hashed_pw TEXT,
admin_rights BOOLEAN
);

INSERT INTO product_models(model_number, dimensions_lwh, weight_kg, retail_price) VALUES
('j1def', '400 x 400 x 350', 10, 300),
('as2jw', '350 x 300 x 175', 8, 250),
('djwm3', '500 x 450 x 600', 14, 350),
('4nejs', '400 x 500 x 290', 13, 280),
('ddj3w', '440 x 430 x 285', 10, 250);
INSERT INTO users(email, name, hashed_pw, admin_rights) VALUES
('admin1@company.com', 'Jiachen', '06770a3a38297cb15da2a92c2111af0943b0ab29afc552d36e4e020fe3b75e2fbddc3ee85a59d3eb189c7ec250c738fc57c2b8027869cf415a6ceacd4135a2d5', true),
('admin2@company.com', 'Johnny', 'b0002913031eeb76a32e4624b50628dba1f9a8d8f62b1f341b660a8f56b74cbc44877ff2831da2e61132eba92b5de2d5a4ab650eabdbe20877c51b93ab818137', true),
('deliver1@company.com', 'Sawney', '09e561693bc001584e5a27b460cd47a06e47600fd86f2464b1d7384563d0198c36d28ec03c11b88fd4f1e00c4c22fd45f59fadb44f44b3f1b2e85e1877717383', false),
('deliver2@company.com', 'Bean', '3e7d84ba65f7732fd6e23c1ad9f98b3fdeea11103b47337fa68d4d9ddd978b2d53eb6f80d6af65bc8d3044bf5c340e1afb73a0d7feb1cfe79f869510c71d592d', false),
('deliver3@company.com', 'Ymir', 'c75c2de6f77e2a64d7f096352eeb4472b3bd79c39aecd749dd3e50996eb8a25d07efab3b7c65c9139210eab2466afe495b59f3d7ad1ee3dd0849e44e4edf5427', false);