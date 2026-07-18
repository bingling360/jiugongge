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
        "右面击败本层所有初级卫兵，将会开启右面所有机关门"
    ],
    "parallelDo": "",
    "events": {},
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