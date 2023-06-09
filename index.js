const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000;

// middleware
app.use(cors())
app.use(express.json())



// const uri = 'mongodb://localhost:27017'
// const client = new MongoClient(uri)

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.h2fzsvj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const classCollection = client.db("languageDB").collection("classes")
    const instructorCollection = client.db("languageDB").collection("instructors")
    const reviewCollection = client.db("languageDB").collection("reviews")


    // classes related apis
    app.get('/popular-classes', async(req, res) => {
        const result = await classCollection.find().sort({ students: -1 }).limit(6).toArray();
        res.send(result)
    })

    // instructors related apis
    app.get('/popular-instructors', async(req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'classes',
            localField: 'email',
            foreignField: 'instructorEmail',
            as: 'classes'
          }
        },
        {
          $addFields: {
            totalStudents: { $sum: '$classes.students' }
          }
        },
        {
          $sort: { totalStudents: -1 }
        },
        {
          $limit: 6
        },
        {
          $project: {
            _id: 0,
            name: 1,
            email: 1,
            image: 1,
            totalStudents: 1
          }
        }
      ];

      const result = await instructorCollection.aggregate(pipeline).toArray()
      res.send(result)
    })

    app.get('/instructors', async(req, res) => {
      const result = await instructorCollection.find().toArray()
      res.send(result)
    })

    // review api
    app.get('/reviews', async(req, res) => {
      const result = await reviewCollection.find().toArray()
      res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Server is running..')
})

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`)
})