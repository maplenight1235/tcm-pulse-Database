/**
 * 將瀏覽器重新導向到指定的頁面路徑。
 * 例如，呼叫 goTo('query') 會將頁面跳轉到 /query。
 */
function goTo(page) {

    window.location.href = "/" + page;
}