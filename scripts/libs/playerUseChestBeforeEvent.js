import { Block, Container, Player, world } from "@minecraft/server";

/**
 * @callback PlayerUseChestBeforeEventCallback
 * @param {PlayerUseChestBeforeEvent} event - チェストがプレイヤーによって使用されたときに発火します
 */

/**
 * @typedef {Object} PlayerUseChestBeforeEvent 
 * @property {Player} player - 使用したプレイヤー
 * @property {Block} interactBlock - 使用されたブロック
 * @property {boolean} isFirstEvent - 最初のイベントかどうか
 * @property {boolean} isLarge - ラージチェストかどうか
 * @property {ChestPair?} chestPair - isLargeがtrueの時のみ存在
 * @property {boolean} cancel - イベントをキャンセル
 */

/**
 * @typedef {Object} ChestPair
 * @property {Block} first - 最初のブロック
 * @property {Block} second - ペアのブロック
 */

const callbacks = new Map();

export default class playerUseChestBeforeEvent {
    /**
     * @param {PlayerUseChestBeforeEventCallback} callback
     */
    constructor(callback) {
        this.callback = callback;
        callbacks.set(this.callback, true);
    }

    /**
     * @param {PlayerUseChestBeforeEventCallback} callback 
     */
    static subscribe(callback) {
        new playerUseChestBeforeEvent(callback);
    }

    /**
     * @param {PlayerUseChestBeforeEventCallback} callback 
     */
    static unsubscribe(callback) {
        callbacks.delete(callback);
    }
}

world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    const { player, isFirstEvent, block } = ev;
    const largeChest = getLargeChest(block);
    test(block);

    /** @type {PlayerUseChestBeforeEvent} */
    let events = {
        player,
        interactBlock: block,
        isFirstEvent,
        isLarge: largeChest ? true : false,
        chestPair: largeChest,
        cancel: false
    };

    callbacks.forEach((_, callback) => callback(events));

    if (events.cancel) {
        ev.cancel = true;
    }
});

/**
 * @param {Block} block 
 */
function test(block) {
    world.sendMessage(`${JSON.stringify(block.permutation.getAllStates())}`);
}

/**
 * @param {Block} block 
 * @returns {Container | undefined}
 */
function getContainer(block) {
    return block.getComponent("inventory")?.container;
}

/**
 * @param {Block} block 
 * @returns {{first: Block, second: Block} | undefined} 
 */
function getLargeChest(block) {
    if (block.typeId !== "minecraft:chest") return undefined;

    const defaultContainer = getContainer(block);
    if (!defaultContainer || defaultContainer.size !== 54) return undefined;

    const directions = ["west", "east", "north", "south"];

    for (const direction of directions) {
        /** @type {Block} */
        const adjacentBlock = block[direction]();
        const adjacentContainer = getContainer(adjacentBlock);

        if (
            adjacentContainer &&
            adjacentContainer.size === 54 &&
            checkObject(block.permutation.getAllStates(), adjacentBlock.permutation.getAllStates()) &&
            checkObject(defaultContainer, adjacentContainer)
        ) {
            return {
                first: block,
                second: adjacentBlock
            };
        }
    }

    return undefined;
}

/**
 * @param  {...Object} objects 
 * @returns {boolean} 
 */
function checkObject(...objects) {
    if (objects.length < 2) return true;

    const [base, ...others] = objects;
    const isEqual = (obj1, obj2) => {
        if (typeof obj1 !== typeof obj2) return false;

        if (obj1 && typeof obj1 === "object") {
            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);

            if (keys1.length !== keys2.length) return false;

            return keys1.every(key => 
                obj2.hasOwnProperty(key) && isEqual(obj1[key], obj2[key])
            );
        }

        return obj1 === obj2;
    };

    return others.every(obj => isEqual(base, obj));
}