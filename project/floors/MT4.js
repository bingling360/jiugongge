main.floors.MT4 = {
    "floorId": "MT4",
    "title": "立方体·顶面",
    "name": "顶面",
    "canFlyTo": true,
    "canFlyFrom": true,
    "canUseQuickShop": true,
    "cannotViewMap": false,
    "defaultGround": "ground",
    "images": [],
    "ratio": 1,
    "map": [
        [  0, 27,  0, 31,  0,  0,  0,  0,  0, 31,  0, 28,  0],
        [ 31,  0,205,  0,  0,  0,  0,  0,  0,  0,205,  0, 31],
        [  0,  0,  0,  0,  0,  0,210,  0,  0,  0,  0,  0,  0],
        [  0,  0,  0,  0,  1,  1, 85,  1,  1,  0,  0,  0,  0],
        [ 28,  0,  0,  0,  1, 27,  0, 28,  1,  0,  0,  0, 27],
        [  0,  0,  0,210, 85,  0, 35,  0, 85,210,  0,  0,  0],
        [  0,  0,  0,  0,  1, 36, 23, 22,  1,  0,  0,  0,  0],
        [  0,  0,  0,  0,  1, 28, 47, 27,  1,  0,  0,  0,  0],
        [ 27,  0,  0,  0,  1,  1, 85,  1,  1,  0,  0,  0, 28],
        [  0,  0,  0,  0,  0,  0,210,  0,  0,  0,  0,  0,  0],
        [  0,  0,  0,  0,  0,  0, 31,  0,  0,  0,  0,  0,  0],
        [ 31,  0,209,  0,  0,  0,  0,  0,  0,  0,209,  0, 31],
        [  0, 28,  0, 31,  0,  0,  0,  0,  0, 31,  0, 27,  0]
    ],
    "firstArrive": [
        {"type":"text","text":"\t[骷髅士兵,skeletonWarrior]击败顶面的四名骷髅士兵，即可打开宝库机关门，取得挑战最终花妖所需的装备和红钥匙。"}
    ],
    "parallelDo": "",
    "events": {},
    "changeFloor": {},
    "afterBattle": {
        "6,2": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT4',['skeletonWarrior'],[[6,3],[4,5],[8,5],[6,8]]);}"}],
        "3,5": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT4',['skeletonWarrior'],[[6,3],[4,5],[8,5],[6,8]]);}"}],
        "9,5": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT4',['skeletonWarrior'],[[6,3],[4,5],[8,5],[6,8]]);}"}],
        "6,9": [{"type":"function","function":"function(){core.plugin.cubeWorld.openDoorsWhenClear('MT4',['skeletonWarrior'],[[6,3],[4,5],[8,5],[6,8]]);}"}]
    },
    "afterGetItem": {},
    "afterOpenDoor": {},
    "cannotMove": {},
    "bgmap": [],
    "fgmap": [],
    "width": 13,
    "height": 13,
    "autoEvent": {},
    "beforeBattle": {},
    "cannotMoveIn": {}
};
