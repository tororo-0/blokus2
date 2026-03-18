class player {
    constructor(id, color, name) {
        this.id = id;
        this.color = color;
        this.name = name;
        this.pieces = [];
    }
}

const red = new player("r", "red", "赤");
const blue = new player("b", "blue", "青");
const yellow = new player("y", "yellow", "黄色");
const green = new player("g", "green", "緑");

player_list = [red, blue, yellow, green];

/**
 * カラー配列をランダムにシャッフルしてターンを決める関数
 * [red, blue, green, yellow] => [blue, yellow, red, green]
 */
const generate_game_turn = (player_list) => {
    const game_turn = [...player_list];

    for (let i = game_turn.length - 1; i >= 0; i--) {
        let rand = Math.floor(Math.random() * (i + 1));
        // 配列の要素の順番を入れ替える
        let tmpStorage = game_turn[i];
        game_turn[i] = game_turn[rand];
        game_turn[rand] = tmpStorage;
    }

    return game_turn;
}

/**
 * 現在のターン表示を更新します
 */
const display_update_turn = (player) => {
    const turn_text = document.querySelector('.turn-color');
    const turn_box = document.querySelector('.turn-box');
    if (turn_text && turn_box) {
        turn_text.textContent = player.name;
        turn_box.style.backgroundColor = player.color;
    }
}
/**
 * ゲーム開始関数
 * スクリプト末尾で開始してます
 */
const start = () => {
    game_turn = generate_game_turn(player_list);
    i = 0;
    while (true) {
        display_update_turn(game_turn[i]);
        i++;
        if (i > 3) {
            i = 0;
        }
        return;
    }    
}

start()