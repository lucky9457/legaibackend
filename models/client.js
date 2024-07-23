const mongoose = require("mongoose");

// Function to generate a unique 7-digit number
async function generateUniqueSNo() {
  while (true) {
    const randomSNo = Math.floor(1000000 + Math.random() * 9000000);
    const existingClient = await Client.findOne({ sNo: randomSNo });
    if (!existingClient) {
      return randomSNo;
    }
  }
}

const ClientSchema = new mongoose.Schema(
  {
    sNo: {
      type: Number,
      unique: true
    },
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    mobileNumber: {
      type: String,
      required: true
    },
    remarks: {
      type: String,
      required: true
    },
    createdAt: {
      type: String,
      default: () =>
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).format(new Date())
    }
  },
  { collection: "Clients" }
);

// Middleware to set the unique 7-digit sNo before saving the document
ClientSchema.pre('save', async function (next) {
  if (!this.sNo) {
    this.sNo = await generateUniqueSNo();
  }
  next();
});

const Client = mongoose.model("Client", ClientSchema);
module.exports = Client;
