main.floors.MT3=
{
    "floorId": "MT3",
    "title": "右面",
    "name": "右面",
    "canFlyTo": true,
    "canFlyFrom": true,
    "canUseQuickShop": true,
    "cannotViewMap": false,
    "defaultGround": "ground",
    "images": [],
    "ratio": 1,
    "map": [
    [221,  1,  1,  1,  1,  1,  1, 81,  1, 81,  1,  1,221],
    [  0,  0,215,  0, 34,  0, 21,  0,213,  0, 28, 22,  1],
    [  1,  0,  1,  1,  1, 81,  1,201,  1, 81,  1,  1,  1],
    [  1,225,  0,164,  0,204,  1,  0,  1,  0, 28,  0, 85],
    [ 81, 28, 50,  1,202, 27,  0, 31,  1, 34,  0,217,  1],
    [  1,  1,  1,  1, 82,  1,  1,  1,  1, 82,  1, 81, 85],
    [  0,  0,  0,  0,  0,  0,164, 22,131, 81,  0, 50,  1],
    [  1,  1,  1,  1,  1, 82,  1,203,  1, 34,215,203, 85],
    [ 81, 21,  0,203, 28, 27,  1,202,  1,  0, 28,203,  1],
    [204, 27,202,164,201, 34, 82,201,  1,210,  0, 32, 85],
    [  0,  1,  1,  1,  1,  1,  1,  0,  1, 81,  1,  1,  1],
    [225,  0, 21, 29, 29,203,  0, 27,213,  0, 69, 21,  1],
    [221,  1,  1,  1, 81,  1,  1, 82,  1,  1,  1, 81,221]
],
    "firstArrive": [
        "右面击败本层所有初级卫兵，将会开启右面所有机关门"
    ],
    "parallelDo": "",
    "events": {
        "8,6": {
            "event": [
                {
                    "type": "openShop",
                    "id": "shop1",
                    "open": true
                }
            ]
        }
    },
    "changeFloor": {},
    "afterBattle": {
        "0,0": [
            {
                "type": "setValue",
                "name": "flag:右面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "12,0": [
            {
                "type": "setValue",
                "name": "flag:右面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "0,12": [
            {
                "type": "setValue",
                "name": "flag:右面机关门计数",
                "operator": "+=",
                "value": "1"
            }
        ],
        "12,12": [
            {
                "type": "setValue",
                "name": "flag:右面机关门计数",
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
        "12,3": {
            "0": {
                "condition": "flag:右面机关门计数==4",
                "currentFloor": true,
                "priority": 0,
                "delayExecute": false,
                "multiExecute": false,
                "data": [
                    {
                        "type": "openDoor",
                        "loc": [
                            12,
                            3
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            12,
                            5
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            12,
                            7
                        ],
                        "async": true
                    },
                    {
                        "type": "openDoor",
                        "loc": [
                            12,
                            9
                        ],
                        "async": true
                    },
                    {
                        "type": "waitAsync"
                    },
                    {
                        "type": "setValue",
                        "name": "flag:右面机关门计数",
                        "operator": "=",
                        "value": "null"
                    }
                ]
            },
            "1": null
        }
    },
    "beforeBattle": {},
    "cannotMoveIn": {}
}