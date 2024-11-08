import { ChatSendBeforeEvent, Entity, Player, ScriptEventCommandMessageAfterEvent, world } from "@minecraft/server";

/**
 * @typedef {Object} CommandSetting
 * @property {string} prefix
 * @property {string} id
 */

/**
 * @typedef {SubCommand[]} Commands
 */

/**
 * @typedef {Object} SubCommand 
 * @property {string} name
 * @property {string?} description
 * @property {SubCommand[]?} subCommands
 * @property {string?} tags
 */

/**
 * @typedef {Object} WrapCommand 
 * @property {CommandSetting} commandSetting
 * @property {SubCommand[]} commands 
 */

/**
 * @typedef {Object} CommandReturn
 * @property {boolean} isPrefixId
 * @property {boolean} result
 * @property {string?} name
 * @property {string[]} splitMessage
 */

/**
 * @typedef {Object} MatchReturn
 * @property {boolean} result
 * @property {string?} name
 * @property {string[]} remainingMessage
 */

/** @type {Map<string, WrapCommand>} */
const wrapCommands = new Map();

export class CommandHandler {
    /**
     * コマンドの設定をします
     * @param {string} commandsPath - commandsフォルダーへのパス (commandHandler.jsから)
     * @param {CommandSetting} commandSetting - コマンドの基本設定
     * @param {Commands} commands - コマンド
     * @param {boolean} log - コマンドの登録をログで確認する
     */
    constructor(commandsPath, commandSetting, commands, log = false) {
        this.uuid = generateUUIDv4();
        this.commandsPath = commandsPath;
        this.commandSetting = commandSetting;
        this.commands = commands;

        if (!wrapCommands.has(this.uuid)) {
            wrapCommands.set(this.uuid, {
                commandSetting: this.commandSetting,
                commands: this.commands
            });

            const commands = this.getAllSubCommands(this.commands);

            (async () => {
                for (const command of commands) {
                    try {
                        await import(`${this.commandsPath}/${command}`);

                        if (log) {
                            console.warn(`${command}がコマンドとして登録されました`);
                        }
                    } catch (e) {
                        console.error(e);
                        console.error(`${command}は${this.commandsPath}内にないため処理されません`);
                    }
                }
            })();
        }
    }

    /**
     * メッセージを確認します
     * @param {ChatSendBeforeEvent | ScriptEventCommandMessageAfterEvent} ev 
     */
    check(ev) {
        let message;
        let entity;

        if (ev instanceof ChatSendBeforeEvent) {
            message = ev.message;
            entity = ev.sender;
        } else if (ev instanceof ScriptEventCommandMessageAfterEvent) {
            message = `${ev.id} ${ev.message}`;
            entity = ev.sourceEntity;
        } else return;

        const { isPrefixId, result, name, splitMessage } = this.command(message, entity);

        if (isPrefixId || result || name) {
            if (ev instanceof ChatSendBeforeEvent) {
                ev.cancel = true;
            }

            if (!name && entity instanceof Player) {
                entity.sendMessage(`§cエラー: 無効なコマンドです。`);
                return;
            }

            if (!result && name && entity instanceof Player) {
                entity.sendMessage(`§cエラー: コマンドの実行権限がありません。`);
                return;
            }

            (async () => {
                try {
                    const module = await import(`${this.commandsPath}/${name}`);

                    module.run(entity, splitMessage);
                } catch (e) {
                    console.error(e);
                }
            })();
        }
    }

    /**
     * @param {string} message 
     * @param {Entity?} entity 
     * @returns {CommandReturn}
     */
    command(message, entity) {
        const { prefix, id } = this.commandSetting;

        if (message.startsWith(prefix) || message.startsWith(id)) {
            message = message.replace(prefix, "").trim();
            message = message.replace(id, "").trim();
        } else {
            return { isPrefixId: false, result: false, name: null, splitMessage: [] };
        }

        const splitMessage = message.split(" ");
        const { result, name, remainingMessage } = this.match(this.commands, splitMessage, entity);

        if (result && name) {
            return { isPrefixId: true, result: true, name: name, splitMessage: remainingMessage };
        } else if (!result && name) {
            return { isPrefixId: true, result: false, name: name, splitMessage: remainingMessage };
        } else if (prefix === "") {
            return { isPrefixId: true, result: false, name: null, splitMessage: [] };
        } else if (id === "") {
            return { isPrefixId: true, result: false, name: null, splitMessage: [] };
        }

        return { isPrefixId: true, result: true, name: null, splitMessage };
    }

    /**
     * @param {SubCommand[]} commands 
     * @param {string[]} splitMessage 
     * @param {Entity?} entity 
     * @returns {MatchReturn}
     */
    match(commands, splitMessage, entity) {
        if (splitMessage.length === 0) {
            return {
                result: true,
                name: splitMessage[0],
                remainingMessage: []
            };
        }

        const currentCommand = splitMessage[0];
        const remainingMessage = splitMessage.slice(1);

        for (const command of commands) {
            const hasRequiredTags = entity
                ? command.tags
                    ? command.tags.length === 0 || command.tags.some(tag => entity.getTags().includes(tag))
                    : true
                : true;

            if (command.name === currentCommand) {
                if (hasRequiredTags) {
                    if (command.subCommands) {
                        const matchResult = this.match(command.subCommands, remainingMessage, entity);

                        return {
                            result: matchResult.result,
                            name: matchResult.name,
                            remainingMessage: matchResult.remainingMessage
                        };
                    }

                    return {
                        result: true,
                        name: splitMessage[0],
                        remainingMessage
                    };
                }

                return {
                    result: false,
                    name: splitMessage[0],
                    remainingMessage
                };
            }
        }

        return {
            result: false,
            name: null,
            remainingMessage: splitMessage
        };
    }

    /**
     * 最下層のコマンド名を取得します
     * @param {SubCommand[]} commands - コマンドのリスト
     * @returns {string[]} - 最下層のコマンド名のリスト
     */
    getAllSubCommands(commands) {
        const bottomCommands = [];

        for (const command of commands) {
            if (command.subCommands && command.subCommands.length > 0) {
                bottomCommands.push(...this.getAllSubCommands(command.subCommands));
            } else {
                bottomCommands.push(command.name);
            }
        }

        return bottomCommands;
    }
}

/**
 * UUIDv4を生成します
 * @returns {string} - UUID
 */
function generateUUIDv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}