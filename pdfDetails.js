const mongoose = require("mongoose");

const PdfDetailsSchema = new mongoose.Schema(
  {
 
    title: String,
    pdf: String,
    filetype:String,
    uploadDate:String,
     filesize:String,
    Category:String,
    status:String
  },
  { collection: "PdfDetails" }
);

mongoose.model("PdfDetails", PdfDetailsSchema);
3