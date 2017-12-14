let port = 8080,
    fs = require('fs'),
    path = require('path'),
    json2xml = require('json2xml'),
    express = require('express'),
    app = express(),
    smmdb = require('smm-api');

require('colors');

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

app.listen(port, () => {
    console.log('Server'.blue + ' started '.green.bold + 'on port '.blue + new String(port).yellow);
});

app.get('/api/v1/pickup/:difficulty', async (request, response) => {
    let valid = ['easy', 'normal', 'expert', 'super_expert'], // valid difficulty types
        difficulty = request.params.difficulty,
        difficulty_index; // SMMDB tracks difficulty by an index, so we create this variable for later

    response.set('Content-Type', 'text/xml');
    if (valid.indexOf(difficulty) <= -1) {
        return response.sendStatus(404); // if the requested difficulty isn't valid, send a 404
    }

    // convert the difficulty to the index for SMMDB
    switch (difficulty) {
        case 'easy':
            difficulty_index = 0;
            break;
        case 'normal':
            difficulty_index = 1;
            break;
        case 'expert':
            difficulty_index = 2;
            break;
        case 'super_expert':
            difficulty_index = 3;
            break;
    }

    // create base JSON object.
    // SMM expects an XML response, but working in XML is a pain.
    // So instead we work in JSON and convert to XML later
    let json = {
        root: {
            courses: []
        }
    }

    // the official servers always return 400 courses, however SMMDB limits the courses in its response.
    // to get the 400, we must make 2 requests, the second one with an offset
    let courses = await getCourses(null, 200, difficulty_index);
    for (let course of courses) {
        json.root.courses.push({
            course: {
                id: course.id
            }
        });
    }

    courses = await getCourses(121, 80, difficulty_index);
    for (let course of courses) {
        json.root.courses.push({
            course: {
                id: course.id
            }
        });
    }

    // convert JSON to XML and send
    response.send(json2xml(json));
});

// I made this its own function in order to shrink the code, reduce duplication, and to add
// `Promise` support to the module (we required a `Promise` to utilize async/await)
function getCourses(start, limit, difficulty_index) {
    return new Promise((resolve, reject) => {
        smmdb.searchCourses({
            order: 'uploaded',
            limit: limit,
            start: start,
            difficultyfrom: difficulty_index,
            difficultyto: difficulty_index
        }, (error, courses) => {
            if (error) return reject(error);
            return resolve(courses);
        });
    });
}