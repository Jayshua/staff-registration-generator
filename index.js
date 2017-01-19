/****************************************************************
This program gets all of the "Staff Registration" submissions
from JotForm and saves them as a nicely formatted pdf that
matches the handwritten submissions. This way they can all
be put into a binder together without the online submissions
looking completly different.

Jayshua Nelson - 1/13/2017
****************************************************************/
let config = require("./config");

let fileSystem    = require("fs");          // For reading the templates
let readline      = require("readline");    // For getting user input
let moment        = require("moment");      // For parsing user input and comparing dates
let handlebars    = require("handlebars");  // For generating the submission templates
let jotform       = require("jotform");     // For getting the submissions from jotform
let wkhtmltopdf   = require("wkhtmltopdf"); // For converting the handlebars template into a pdf
let entityDecoder = require("he");          // For html decoding the field names provided by jotform
let opn           = require("opn");         // For opening the user's browser



/**************
Setup Jotform
***************/
jotform.options({
	debug: config.debug,
	apiKey: config.apiKey
});



/**************
Setup handlebars
***************/
let pageTemplate         = fileSystem.readFileSync("./templates/page.html").toString();
let recordTemplate       = fileSystem.readFileSync("./templates/record.html").toString();
let healthCheckinPartial = fileSystem.readFileSync("./templates/health_checkin.html").toString();
let paymentsPartial      = fileSystem.readFileSync("./templates/payments.html").toString();

// Register a helper to automatically generate the paragraph and underlines for each field
handlebars.registerHelper("field", function(field, label) {
	// Let the user use the field name if they don't explicitly provide a label
	if (typeof label !== "string") {
		label = field;
	}

	// Determine whether the submission includes the requested field, and how it should be printed if so
	let result = "";

	// Print three dashes if the submission does not contain the requested field
	if (typeof this[field] === "undefined") {
		result = "---";

	// Print the pretty-formated version of the field if the field provides one
	} else if (typeof this[field].prettyFormat !== "undefined") {
		if (this[field].prettyFormat === "") {
			result = "---";
		} else {
			result = `<span class="underline">` + this[field].prettyFormat + `</span>`;
		}

	// Otherwise print the raw answer
	} else {
		result = `<span class="underline">` + this[field].answer + `</span>`;
	}

	// Return the paragraph representing the field requested
	return new handlebars.SafeString(`<p>${label}: ${result}</p>`);
});


handlebars.registerPartial("healthCheckin", healthCheckinPartial);
handlebars.registerPartial("payments", paymentsPartial);


let buildRecord = handlebars.compile(recordTemplate, {noEscape: true});
let buildDocument = handlebars.compile(pageTemplate, {noEscape: true});



/**************
Setup wkhtmltopdf
***************/
wkhtmltopdf.command = "C:\\Program Files\\wkhtmltopdf\\bin\\wkhtmltopdf.exe";


/*************
Setup the input reader
**************/
let reader = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});


/**************
Execute
***************/
// Get the submissions
console.log("Downloading Submissions...\n");
console.log("Please enter the last date submissions were printed - all submissions after the provided date will be printed now.");
console.log("Example: ??/??/????");

Promise.all([
	jotform.getFormSubmissions(config.formID),
	new Promise(resolve => reader.question("> ", answer => resolve(moment(answer, "MM/DD/YYYY"))))
])
.then(([submissions, date]) => {
	let submissionObjects = submissions
		// Filter the submissions for just those submitted after the date provided by the user
		.filter(submission => moment(submission.created_at).isAfter(date))

		// Put every answer in each submission into an object indexed by the question text
		.map(submission => {
			let answerObject = {};

			Object.keys(submission.answers).forEach(questionID => {
				let answer = submission.answers[questionID];
				answerObject[answer.text] = answer;
			});

			return answerObject;
		});


	// Exit if there are no submissions to print
	if (submissionObjects.length === 0) {
		console.log("No new submissions.");
		return;
	} else {
		console.log(`Found ${submissionObjects.length} new submission(s)`);
	}

	console.log("Generating Registration Forms");


	// Generate the HTML for each submission
	let records = submissionObjects.map(buildRecord).reduce((x, y) => x + y);
	let htmlDocument = buildDocument({records});


	// Save the html for debugging
	if (config.debug)
		fileSystem.writeFileSync("./output.html", htmlDocument);


	// Generate the pdf
	wkhtmltopdf(
		buildDocument({records: records}),

		{
			output: "output.pdf",
			orientation: "Landscape",
			pageSize: "Letter",
			marginTop: "8mm",
			marginBottom: "8mm",
			marginLeft: "8mm",
			marginRight: "8mm",
		},

		// Print the pdf after generation
		function() {
			console.log("Opening the PDF");
			opn("output.pdf");
			console.log(`All done!`);
			console.log(`To print your PDF:`);
			console.log(`1. Press the print button in the upper right corner of Google Chrome`);
			console.log(`2. Click the "Print using system dialog" link in the bottom left corner.`);
			console.log(`3. Ensure that the "Kyocera" printer is chosen.`);
			console.log(`4. Press the "Preferences" button.`);
			console.log(`6. Choose the third duplex option (Flip on short edge)`);
			console.log(`7. Press OK and click Print`);
		}
	);
})

// Close the reader reading user input
.then(() => {
	reader.close();
})

// Log any errors
.catch(console.log);
