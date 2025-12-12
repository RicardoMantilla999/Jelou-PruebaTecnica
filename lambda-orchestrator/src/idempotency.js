const store = {};

function getKey(customer_id, items) {
    return JSON.stringify({ customer_id, items });
}

function check(key) {
    return store[key] || null;
}

function save(key, response) {
    store[key] = response;
}

module.exports = { getKey, check, save };
