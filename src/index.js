color_list = ["r", "b", "g", "y"]

/**
 * カラー配列をランダムにシャッフルしてターンを決める関数
 * ["r", "b", "g", "y"] => ["b", "y", "r", "g"]
 */
const generate_game_turn = (color_list) => {
    const game_turn = [...color_list]

    for (let i = game_turn.length - 1; i >= 0; i--) {
        let rand = Math.floor(Math.random() * (i + 1))
        // 配列の要素の順番を入れ替える
        let tmpStorage = game_turn[i]
        game_turn[i] = game_turn[rand]
        game_turn[rand] = tmpStorage
    }

return game_turn
}

/**
 * ターンのテキストを返します
 */
const get_turn_text = (turn) => {
    switch (turn) {
        case "r":
            return "赤"
        case "b":
            return "青"
        case "g":
            return "緑"
        case "y":
            return "黄"
    }
}

/**
 * ターンのカラーを返します
 */
const get_turn_color = (turn) => {
    switch (turn) {
        case "r":
            return "red"
        case "b":
           return "blue"
        case "g":
            return "green"
        case "y":
           return "yellow"
    }
}

/**
 * 現在のターン表示を更新します
 */
const display_update_turn = (turn) => {
    const turn_text = document.querySelector('.turn-color');
    const turn_box = document.querySelector('.turn-box');
    if (turn_text && turn_box) {
        turn_text.textContent = get_turn_text(turn);
        turn_box.style.backgroundColor = get_turn_color(turn);
    }
}
/**
 * ゲーム開始関数
 * スクリプト末尾で開始してます
 */
const start = () => {
    game_turn = generate_game_turn(color_list)
    i = 0
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