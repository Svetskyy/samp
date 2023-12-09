const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const zlib = require("zlib");
const NodeCache = require("node-cache");
const util = require("util");
const cors = require("cors");

const cache = new NodeCache({ stdTTL: 3600 }); // Set expiration time to 1 hour

const db = mysql.createPool({
  connectionLimit: 100,
  host: "154.41.240.230",
  user: "u532639681_root",
  password: "W@2915djkq#",
  database: "u532639681_mydatabase",
  compress: true, // Enable compression
  stream: function (options, callback) {
    return zlib.createGzip(options, callback);
  },
});

db.on('connection', (connection) => {
  console.log('New connection made to the database');
});

db.on('error', (err) => {
  console.error('Error in MySQL connection pool:', err);
});

// Use util.promisify to convert db.query to a promise-based function
const queryAsync = util.promisify(db.query).bind(db);

const app = express();
app.use(bodyParser.json({ limit: "50mb" }));
app.use(cors());
app.use(express.static("./"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "." });
});

app.get("/api/check-connection", (req, res) => {
  if (db.state === 'disconnected') {
    res.json({ connected: false });
  } else {
    res.json({ connected: true });
  }
});

app.post("/api/check", async (req, res) => {
  const { sourceCoordinates, destCoordinates } = req.body;
  const cacheKey = `${JSON.stringify(sourceCoordinates)}_${JSON.stringify(destCoordinates)}`;

  try {
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
      const algResultsObject = JSON.parse(cachedResult);
      console.log("Data retrieved from cache");

      const dbResult = await queryAsync("SELECT algResults FROM genetic_data2 WHERE sourceCoordinates = ? AND destCoordinates = ?", [JSON.stringify(sourceCoordinates), JSON.stringify(destCoordinates)]);

      if (dbResult.length > 0) {
        console.log("Data exists in database");
        res.json({ exists: true, algResults: algResultsObject });
      } else {
        console.log("Data not in database, saving from cache to database");
        await queryAsync("INSERT INTO genetic_data2 (sourceCoordinates, destCoordinates, algResults) VALUES (?, ?, ?)", [JSON.stringify(sourceCoordinates), JSON.stringify(destCoordinates), JSON.stringify(algResultsObject)]);
        console.log("Data saved to database from cache");
        res.json({ exists: true, algResults: algResultsObject });
      }
    } else {
      const dbResult = await queryAsync("SELECT algResults FROM genetic_data2 WHERE sourceCoordinates = ? AND destCoordinates = ?", [JSON.stringify(sourceCoordinates), JSON.stringify(destCoordinates)]);

      if (dbResult.length > 0) {
        const algResultsObject = JSON.parse(dbResult[0].algResults);
        cache.set(cacheKey, JSON.stringify(algResultsObject));
        console.log("Data retrieved from database and saved to cache");
        res.json({ exists: true, algResults: algResultsObject });
      } else {
        console.log("Data does not exist in cache or database");
        res.json({ exists: false });
      }
    }
  } catch (error) {
    console.error("Error checking data:", error);
    res.status(500).send("Error checking data");
  }
});
app.post("/api/save-result", async (req, res) => {
  const { sourceCoordinates, destCoordinates, algResults } = req.body;

  try {
    const existingData = await queryAsync("SELECT COUNT(*) as count FROM genetic_data2 WHERE sourceCoordinates = ? AND destCoordinates = ?", [JSON.stringify(sourceCoordinates), JSON.stringify(destCoordinates)]);

    if (existingData[0].count === 0) {
      // Data doesn't exist, insert it into the database
      const insertResult = await queryAsync("INSERT INTO genetic_data2 (sourceCoordinates, destCoordinates, algResults) VALUES (?, ?, ?)", [JSON.stringify(sourceCoordinates), JSON.stringify(destCoordinates), JSON.stringify(algResults)]);

      const cacheKey = `${JSON.stringify(sourceCoordinates)}_${JSON.stringify(destCoordinates)}`;
      cache.set(cacheKey, JSON.stringify(algResults));

      console.log("Data saved to database and cache");
      res.json({ message: "Data saved successfully", id: insertResult.insertId });
    } else {
      console.log("Data already exists in the database");
      res.json({ message: "Data already exists in the database" });
    }
  } catch (error) {
    console.error("Error saving result:", error);
    res.status(500).send("Error saving result");
  }
});


app.delete("/api/delete-directions", async (req, res) => {
  const { sourceCoordinates, destCoordinates } = req.body;
  const cacheKey = `${JSON.stringify(sourceCoordinates)}_${JSON.stringify(destCoordinates)}`;

  try {
    await queryAsync("DELETE FROM genetic_data2 WHERE sourceCoordinates = ? AND destCoordinates = ?", [JSON.stringify(sourceCoordinates), JSON.stringify(destCoordinates)]);
    cache.del(cacheKey);
    res.status(200).send({ message: "Data deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting directions from the database");
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
