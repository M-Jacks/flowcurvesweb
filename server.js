if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
  }
  
  const express = require('express');
  const mysql = require('mysql2/promise');
  const bcrypt = require('bcrypt');
  const passport = require('passport');
  const session = require('express-session');
  const methodOverride = require('method-override');
  const path = require('path');
  const initializePassport = require('./passport-config');
  
  const app = express();
  
  // MySQL connection configuration
  const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME, 
  }; 
  
  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(methodOverride('_method'));
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Initialize Passport
  initializePassport(
    passport,
    async (email) => {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
      connection.end();
      return results[0];
    },
    async (id) => {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
      connection.end();
      return results[0];
    }
  );
  
  // Signup route
  app.post('/signup', checkNotAuthenticated, async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [existingUser] = await connection.execute('SELECT email FROM users WHERE email = ?', [email]);
  
      if (existingUser.length > 0) {
        connection.end();
        return res.status(400).json({ message: 'Account already exists' });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.execute('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);
  
      connection.end();
      res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal Server Error 1' });
    }
  });
  
  // Login route
  app.post('/login', checkNotAuthenticated, async (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error 2' });
      }
      if (!user) {
        return res.status(400).json({ message: info.message });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: 'Internal Server Error 3' });
        }
        return res.status(200).json({ message: 'Login successful' });
      });
    })(req, res, next);
  });
  
  // Logout route
  app.delete('/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error('Error during logout:', err);
        return res.status(500).json({ message: 'Internal Server Error 4' });
      }
      req.session.destroy();
      res.redirect('/login');
    });
  });
  
  
  
  // Products Page
  app.get('/products', checkAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/views/products.html');
  });
  
  // Get route for products table data
  app.get('/productstable', checkAuthenticated, async (req, res) => {
    const productType = req.query.type || 'core';
    const sql = `SELECT Id, product_name FROM productlist WHERE type = ?`;
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(sql, [productType]);
      connection.end();
      res.json(results);
    }
    catch (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ message: 'Internal Server Error 5' });
    }
  });
  
  
  const pool = mysql.createPool(dbConfig);
  
  // Adding a new product
  app.post('/products/add', async (req, res) => {
    try {
      // Retrieve the product details from the request body
      const { productName, productType } = req.body;
  
      // Generate the product ID by capitalizing the first letter of each word in the product name and removing spaces
      const productId = productName.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1)).replace(/\s/g, '');
  
      // Check if the product already exists in the database
      const connection = await pool.getConnection();
      const [existingProduct] = await connection.execute('SELECT id FROM productlist WHERE id = ?', [productId]);
  
      if (existingProduct.length > 0) {
        connection.release();
        return res.status(400).json({ message: 'Product already exists' });
      }
  
      // Insert the new product into the database
      await connection.execute('INSERT INTO productlist (id, product_name, type) VALUES (?, ?, ?)', [productId, productName, productType]);
      connection.release();
    } catch (error) {
      console.error('Error adding product:', error);
      res.status(500).json({ message: 'Internal Server Error 6' });
    }
  });
  
  
  
  
  
  
  // Home page route
  app.get('/', checkAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/views/products.html');
  });
  
  // Login page route
  app.get('/login', checkNotAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
  });
  
  
  
  
  // Tests Page
  app.get('/teststable', checkAuthenticated, async (req, res) => {
    const sql = 'SELECT * FROM tableoftestsv1';
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(sql);
      connection.end();
      if (results.length === 0) {
        res.status(404).send('No tests found');
        return;
      }
      res.json(results);
    } catch (error) {
      console.error('Error fetching tests:', error);
      res.status(500).send('Error fetching tests');
    }
  });
  
  // Define route to fetch test data by test ID
  app.get('/teststable/:pId', checkAuthenticated, async (req, res) => {
    const ProductName = req.params.pId;
    console.log(ProductName);
  
    const sql = 'SELECT * FROM tableoftestsv1 WHERE Product = ?';
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(sql, [ProductName]);
      connection.end();
  
      if (results.length === 0) {
        console.log('No tests found for productId:', ProductName);
        res.json([]); // Return an empty array if no tests are found
        return;
      }
  
      console.log('Tests found for productId:', ProductName);
      res.json(results);
    } catch (err) {
      console.error('Error fetching test data:', err);
      res.status(500).send('Internal Server Error 7');
    }
  });
  
  // Define route to fetch test data by test ID
  app.get('/testsbyId', checkAuthenticated, async (req, res) => {
    const testId = req.query.testId;
    const sql = 'SELECT * FROM tableoftestsv1 WHERE Test_Id = ?';
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(sql, [testId]);
      connection.end();
      if (results.length === 0) {
        res.status(404).send('Test not found');
        return;
      }
      res.json(results[0]);
    } catch (error) {
      console.error('Error fetching test data:', error);
      res.status(500).send('Error fetching test data');
    }
  });
  
  app.get('/tests', checkAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/views/tests.html');
  });
  
  // GET route to fetch test data based on product ID
  app.get('/teststable/:pId', checkAuthenticated, async (req, res) => {
    const ProductName = req.params.pId;
    console.log(ProductName)
    // Query to fetch test data from the database based on the product ID
    let sql = 'SELECT * FROM tableoftestsv1 WHERE Product = ?';
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(sql, [ProductName]);
      if (err) {
        console.error('Error fetching test data:', err);
        res.status(500).send('Internal Server Error 8');  
        return;
      }
  
      // Check if any tests were found for the product
      if (result.length === 0) {
        console.log('No tests found for productId:', ProductName);
        res.json([]); // Return an empty array if no tests are found
        return;
      }
  
      // Return the fetched test data
      console.log('Tests found for productId:', ProductName);
      connection.end();
      res.json(result);
    }
    catch (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ message: 'Internal Server Error 9' });
    }
  });
  
  //add test
  app.post('/add-test-data', checkAuthenticated, async (req, res) => {
    const testData = req.body;
  
    const sql = `INSERT INTO tableoftestsv1 
                 (Product, Device_Id, Board_Version, Firmware, Profile, Test_Engineer, Power_Source, Pump_Type, Pump_Id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [
      testData.productType,
      testData.DeviceIMEI,
      testData.boardVersion,
      testData.firmware,
      testData.profile,
      testData.testEngineer,
      testData.powerSource,
      testData.pumpType,
      testData.pumpserial,
    ];
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(sql, values);
      connection.end();
      res.status(200).send('<script>window.location.reload();</script>Test added successfully');
    } catch (err) {
      console.error('Error adding test data:', err);
      res.status(500).send('Internal Server Error 10');
    }
  });
  
  //update test
  app.patch('/update-test-data', checkAuthenticated, async (req, res) => {
    const Test_Id = parseInt(req.query.testId);
    const updatedData = req.body;
  
    const sql = `UPDATE tableoftestsv1 SET 
                  Device_Id = ?,
                  Board_Version = ?,
                  Firmware = ?,
                  Profile = ?,
                  Test_Engineer = ?,
                  Power_Source = ?,
                  Pump_Type = ?,
                  Pump_Id = ?
                  WHERE Test_Id = ?`;
  
    const values = [
      updatedData.DeviceIMEI,
      updatedData.boardVersion,
      updatedData.firmware,
      updatedData.profile,
      updatedData.testEngineer,
      updatedData.powerSource,
      updatedData.pumpType,
      updatedData.pumpSerial,
      Test_Id,
    ];
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(sql, values);
      connection.end();
      res.status(200).send('<script>window.location.reload();</script>Test data updated successfully');
    } catch (err) {
      console.error('Error updating test data:', err);
      res.status(500).send('Internal Server Error 11');
    }
  });
  
  
  
  
  
  
  
  
  
  
  
  // Results Page
  app.get('/results', checkAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/views/results.html');
  });
  
  //fetch results data based on test ID
  app.get('/resultstable', checkAuthenticated, async (req, res) => {
    const testId = req.query.testId; // Access testId from query parameters
    const sql = 'SELECT Head, Voltage, Current, T1, T2, Time, Power, Flowrate, Efficiency FROM results WHERE TestId = ?';
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(sql, [testId]);
      connection.end();
  
      if (results.length === 0) {
        console.log('No results found for testId:', testId);
        res.json([]); // Return an empty array if no tests are found
        return;
      }
  
      console.log('Results found for testId:', testId);
      res.json(results);
    } catch (err) {
      console.error('Error fetching test data:', err);
      res.status(500).send('Internal Server Error 12');
    }
  });
  
  //fetch results data based on test ID and product ID
  app.get('/resultstable/:testId/:prodId', checkAuthenticated, async (req, res) => {
    const { testId, prodId } = req.params;
    const sql = 'SELECT Head, Voltage, Current, T1, T2, Time, Power, Flowrate, Efficiency FROM results WHERE TestId = ?';
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(sql, [testId]);
      connection.end();
  
      if (results.length === 0) {
        console.log('No results found for testId:', testId);
        res.json([]); // Return an empty array if no tests are found
        return;
      }
  
      console.log('Results found for testId:', testId);
      res.json(results);
    } catch (err) {
      console.error('Error fetching test data:', err);
      res.status(500).send('Internal Server Error 13');
    }
  });
  
  //save results
  app.post('/saveResults', checkAuthenticated, async (req, res) => {
    const jsonData = req.body;
    const allValues = [];
  
    for (let i = 0; i < jsonData.length; i++) {
      const columnData = jsonData[i];
      const columnName = Object.keys(columnData)[0];
      const columnValues = columnData[columnName];
  
      const rowValues = [];
      rowValues.push(columnValues[0]);
      rowValues.push(...columnValues.slice(1));
  
      allValues.push(rowValues);
    }
  
    const query = 'INSERT INTO results (TestId, Head, Voltage, Current, T1, T2, Time, Power, Flowrate, Efficiency) VALUES ?';
  
    try {
      const connection = await mysql.createConnection(dbConfig);
      await connection.query(query, [allValues]);
      connection.end();
      console.log('Data saved successfully');
      res.status(200).send('Data saved successfully');
    } catch (err) {
      console.error('Error saving data:', err);
      res.status(500).send('Error saving data');
    }
  });
  
  
  
  
  //Reports
  app.get('/reports', checkAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/views/reports.html');
  });
  //get all reports endpoint
  app.get('/getreports', checkAuthenticated, async (req, res) => {
    const productType = req.query.type || 'core';
    const sql = `SELECT * FROM test_reports`;
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [results] = await connection.execute(sql, [productType]);
      connection.end();
      res.json(results);
    }
    catch (err) {
      console.error('Error fetching products:', err);
      res.status(500).json({ message: 'Internal Server Error 14' });
    }
  });
  
  //add a new report
  app.post('/reports', checkAuthenticated, async (req, res) => {
    const { title, description } = req.body;
    const date = new Date();
    const query = 'INSERT INTO test_reports (title, description, date) VALUES (?, ?, ?)';
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, [title, description, date]);
      connection.end();
      res.status(201).json({ id: result.insertId, title, description, date });
    } catch (err) {
      console.error('Error saving report:', err);
      res.status(500).json({ error: 'Failed to save report' });
    }
  });
  
  // Endpoint to delete a report
  app.delete('/reports/:id', checkAuthenticated, async (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM reports WHERE id = ?';
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, [id]);
      connection.end();
      console.log('Report deleted with ID:', id);
      res.json({ id });
    } catch (err) {
      console.error('Error deleting report:', err);
      res.status(500).json({ error: 'Failed to delete report' });
    }
  });
  
  // Endpoint to update a report
  app.put('/reports/:id', checkAuthenticated,async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    const query = 'UPDATE reports SET title = ?, description = ? WHERE id = ?';
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, [title, description, id]);
      connection.end();
      console.log('Report updated with ID:', id);
      res.json({ id, title, description });
    } catch (err) {
      console.error('Error updating report:', err);
      res.status(500).json({ error: 'Failed to update report' });
    }
  });
  
  //comparison page
  app.get('/comparison', checkAuthenticated, (req, res) => {
    res.sendFile(__dirname + '/views/comparison.html');
  });
  
  // Authentication check middleware
  function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/login');
  }
  
  function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return res.redirect('/');
    }
    next();
  }
  
  // Start server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
  });