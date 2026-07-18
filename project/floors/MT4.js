main.floors.MT4=
{
    "floorId": "MT4",
    "title": "顶面",
    "name": "顶面",
    "canFlyTo": true,
    "canFlyFrom": true,
    "canUseQuickShop": true,
    "cannotViewMap": false,
    "defaultGround": "ground",
    "images": [],
    "ratio": 1,
    "map": [
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    [  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]
    ],
    "firstArrive": [
        "顶面击败本层所有骷髅士兵，将会开启顶面的所有机关门"
    ],
    "parallelDo": "",
    "events": {},
    "changeFloor": {},
    "afterBattle": {
        "4,1": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "6,1": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "8,1": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "3,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "5,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "7,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "9,2": [
            {
                "type": "setValue",
                "name": "flag:顶面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ]
    },
    "afterGetItem": {},
    "afterOpenDoor": {},
    "cannotMove": {},
    "bgmap": [

],
    "fgmap": [

],
    "width": 13,
    "height": 13,
    "autoEvent": {
        "3,0": {
            "0": {
                "condition": "flag:顶面机关门计数==7",
                "currentFloor": true,
                "priority": 0,
                "delayExecute": false,
                "multiExecute": false,
                "data": [
                    {
                        "type": "openDoor",
                        "loc": [
                            3,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            5,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            7,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            9,
                            0
                        ],
                        "async": true
                    },
                    {
                        "type": "waitAsync"
                    },
                    {
                        "type": "setValue",
                        "name": "flag:顶面机关门计数",
                        "operator": "=",
                        "value": "null"
                    }
                ]
            }
        }
    },
    "beforeBattle": {},
    "cannotMoveIn": {}
}