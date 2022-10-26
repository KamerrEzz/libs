const { Client } = require("@notionhq/client")
const fs = require("fs")

class NotionService {

    constructor({ token, databaseId, storage }) {
        this.Notion = new Client({
            auth: token,
        });
        this.db = databaseId;
        this.storage = storage;

        if (this.storage) {
            if (this._exists()) return;
            this.dbCreate(this.storage);
        }
    }

    getUsers = async () => {
        const users = await this.Notion.users.list({});
        const typePerson = users.results.find((user) => user.type == "person");
        return typePerson;
    };

    getDatabase = async () => {
        const database = await this.Notion.databases.retrieve({
            database_id: this.db
        });
        return database;
    };

    getDatabaseProperties = async () => {
        const database = await this.getDatabase();
        const properties = database.properties;
        return properties;
    }

    getDatabasePropertiesKeys = async () => {
        const properties = await this.getDatabaseProperties();
        const keys = Object.keys(properties);
        return keys;
    }

    getDatabasePropertiesValues = async () => {
        const properties = await this.getDatabaseProperties();
        const values = Object.values(properties);
        return values;
    }

    insertRow = async (data) => {
        const response = await this.Notion.pages.create({
            parent: { database_id: this.db },
            properties: data
        });
        return response;
    }

    getRows = async () => {
        const response = await this.Notion.databases.query({
            database_id: this.db,
        });
        return response;
    }

    getRow = async (id) => {
        const response = await this.Notion.pages.retrieve({
            page_id: id,
        });
        return response;
    }

    getFilterRow = async (filter) => {
        const response = await this.Notion.databases.query({
            database_id: this.db,
            filter: filter
        });
        return response;
    }

    parseRow = (row) => {
        const properties = row.properties;
        const keys = Object.keys(properties);
        const values = Object.values(properties);
        const data = {
            id: row.id,
        };

        keys.forEach((key, index) => {
            const value = values[index];
            if (value.type == "title") {
                data[key] = value.title.length > 0 ? value.title[0].plain_text : false;
            }
            else if (value.type == "rich_text") {
                data[key] = value.rich_text.length > 0 ? value.rich_text[0].plain_text : false;
            }
            else if (value.type == "multi_select") {
                data[key] = value.multi_select.length > 0 ? value.multi_select.map(item => ({ id: item.id, name: item.name })) : false;
            }
            else if (value.type == "select") {
                data[key] = value.select ? { id: value.select.id, name: value.select.name } : false;
            }
            else if (value.type == "number") {
                data[key] = value.number ? value.number : false;
            }
            else {
                data[key] = value[value.type]
            }

        })
        return data;
    }

    parseRows = (rows) => {
        const data = [];
        rows.forEach((row) => {
            data.push(this.parseRow(row));
        });
        return data;
    }

    dbGet = () => {
        return new Promise((resolve, reject) => {
            const folder = "tmp";
            const file = `${folder}/notion-${this.storage}.json`;

            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder);
            }

            if (!fs.existsSync(file)) {
                fs.writeFileSync(file, JSON.stringify([]));
            }

            const data = fs.readFileSync(file);
            const json = JSON.parse(data);
            resolve(json);
        })
    }

    dbFind = (query) => {
        return new Promise(async (resolve, reject) => {
            const data = await this.dbGet();
            const keys = Object.keys(query);
            const values = Object.values(query);
            const result = data.filter((item) => {
                let valid = true;
                keys.forEach((key, index) => {
                    if (item[key] != values[index]) {
                        valid = false;
                    }
                })
                return valid;
            })
            if (result.length > 0) {
                resolve(result);
            } else {
                resolve(false);
            }
        });
    }

    getFindOne = (query) => {
        return new Promise(async (resolve, reject) => {
            const data = await this.dbFind(query);
            if (data) {
                resolve(data[0]);
            } else {
                resolve(false);
            }
        });
    }

    dbSave = (data) => {
        const folder = "tmp";
        const file = `${folder}/notion-${this.storage}.json`;

        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder);
        }
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }

    dbinsert = (data) => {
        const db = this.dbGet();
        db.push(data);
        this.dbSave(db);
    }

    dbDelete = (query) => {
        return new Promise(async (resolve, reject) => {
            const data = this.dbGet();
            const keys = Object.keys(query);
            const values = Object.values(query);
            const result = data.filter((item) => {
                let valid = true;
                keys.forEach((key, index) => {
                    if (item[key] == values[index]) {
                        valid = false;
                    }
                })
                return valid;
            })
            this.dbSave(result);
            resolve(result);
        });
    }

    dbUpdate = (query, data) => {
        return new Promise(async (resolve, reject) => {
            const db = await this.dbGet();
            const keys = Object.keys(query);
            const values = Object.values(query);
            const result = db.map((item) => {
                let valid = true;
                keys.forEach((key, index) => {
                    if (item[key] == values[index]) {
                        valid = false;
                    }
                })
                if (!valid) {
                    return { ...item, ...data };
                } else {
                    return item;
                }
            })
            this.dbSave(result);
            resolve(result);
        });
    }

    dbRemove = (query, propertie) => {
        return new Promise(async (resolve, reject) => {
            const db = await this.dbGet();
            const keys = Object.keys(query);
            const values = Object.values(query);
            const result = db.map((item) => {
                let valid = true;
                keys.forEach((key, index) => {
                    if (item[key] == values[index]) {
                        valid = false;
                    }
                })
                if (!valid) {
                    delete item[propertie];
                    return item;
                } else {
                    return item;
                }
            })
            this.dbSave(result);
            resolve(result);
        });
    }

    dbCreate = () => {
        this.getRows().then((rows) => {
            const data = this.parseRows(rows.results);
            this.dbSave(data);
        });
    }

    dbReload = () => {
        this.dbCreate();
    }

    _exists = () => {
        const folder = "tmp";
        const file = `${folder}/notion-${this.storage}.json`;

        if (!fs.existsSync(folder)) {
            console.log("Folder not exists");
            return false;
        }

        if (!fs.existsSync(file)) {
            console.log("File not exists");
            return false;
        }

        return true;
    }
}

module.exports = NotionService;