import plugin from '../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from "node:fs"
import common from '../../lib/common/common.js'

let jsonData;
let baseData;
let resonanceKey = "Yz:resonance:outTime";
let timeStampLock;

export class resonanceMarcket extends plugin {
  constructor () {
    super({
      /** 功能名称 */
      name: '雷索纳斯时价表查询',
      /** 功能描述 */
      dsc: '雷索纳斯时价表查询',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#时价表查询(.*)$',
          /** 执行方法 */
          fnc: 'resonanceMarcketSearch'
        }
      ]
    })
  }

  /**
   * #时价表查询
   * @param e oicq传递的事件参数e
   */
  async resonanceMarcketSearch (e) {

    this._path = process.cwd()
    //加锁时间
    timeStampLock = await redis.get(resonanceKey);
    if (!timeStampLock) {
      timeStampLock = await this.refreshMarcketFile();
      await common.sleep(1000)
    }
    // 读取文件数据并转为 JSON 格式
    await this.readMarcketFile();
    await common.sleep(1000)
    await this.readBaseFile();
    await common.sleep(1000)

    //计算最佳路线
    let n = ["修格里城", "铁盟哨站", "七号自由港", "澄明数据中心", "阿妮塔战备工厂", "阿妮塔能源研究所", "荒原站", "曼德矿场", "淘金乐园"];
    let result = [];
    for (let p1 in n) {
      let placeA = n[p1];
      for (let p2 in n) {
        let placeB = n[p2];
        if (p1 !== p2) {
          let tRevenue = this.calculateTotalProfit(placeA, placeB);
          result.push(tRevenue);
        }
      }
    }
    result.sort((a, b) => b.totle - a.totle);
    //let jsonString = JSON.stringify(result[0]);
    let replyMsg ='';
    for (let i = 0; i < 7; i++) {
      var eachMsg = result[i];
      replyMsg=replyMsg + ("TOP"+(i+1) + ":"+eachMsg.place+",总收益:"+eachMsg.totle+"["+eachMsg.product+"]\n")
    }
    this.reply(replyMsg)
  }

  /**
   * 计算从A区域到B区域的所有商品收益
   * @param regionData
   * @param fluctuation
   */
  calculateTotalProfit (placeA, placeB) {
    let totalProfit = 0;
    let msg = '';
    let placeAMsg = baseData[placeA];
    for (let i in placeAMsg) {
      let nowPrice = placeAMsg[i];
      let name = nowPrice.name;
      let nowChange = jsonData.data[name];
      let sell = nowChange.sell[placeB];
      if (nowPrice.type === "Special" && sell) {
        let buyPrice = nowPrice.buyPrices[placeA];
        let sellPrice = nowPrice.sellPrices[placeB];
        let buyLot = nowPrice.buyLot[placeA];
        let buy = nowChange.buy[placeA]
        let changeA = buy.variation;
        let changeB = sell.variation;
        let thisTotalProduct = Math.floor(sellPrice * changeB / 100 * 1.04) - Math.floor(buyPrice * changeA / 100 * 0.92);
        //logger.info(placeA + " " + placeB + " " + name + "收益" + thisTotalProduct * buyLot)
        msg = msg + " " + name;
        totalProfit += thisTotalProduct * buyLot;
      }
    }
    return { "place": placeA + placeB, "totle": totalProfit, "product": msg }
  }

  /**
   * 更新文件数据
   * @returns {Promise<*>}
   */
  async refreshMarcketFile () {
    var myHeaders = new Headers();

    var selectedCities = {
      "sourceCities": ["修格里城", "铁盟哨站", "七号自由港"],
      "targetCities": ["铁盟哨站", "修格里城", "澄明数据中心", "七号自由港", "阿妮塔能源研究所", "阿妮塔战备工厂", "荒原站", "曼德矿场", "淘金乐园"]
    };
    var formattedString = JSON.stringify(selectedCities, null, 4);
    myHeaders.append("Cookie", urlEncode(formattedString));
    var requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow'
    };

    await fetch("https://www.resonance-columba.com/api/get-prices", requestOptions)
      .then(response => response.text())
      .then(result => {
        fs.writeFile(`${this._path}/data/resonanceMarcket.json`, result, (err) => {
          if (err) throw err;
          timeStampLock = Math.floor(Date.now() / 1000); // 获取当前时间戳（单位：秒）
          redis.set(resonanceKey, timeStampLock, { EX: 3600 });//采集信息有效期 1小时
          this.reply(`历史数据已超时，更新数据成功`)
        });
      })
      .catch(error => logger.error('error', error));
    return timeStampLock;
  }

  /**
   * 读取文件数据，存入jsonDate
   * @param str
   */
  readMarcketFile (str) {
    fs.readFile(`${this._path}/data/resonanceMarcket.json`, 'utf8', (err, data) => {
      if (err) {
        logger.error(err);
        return;
      }
      try {
        jsonData = JSON.parse(data);
        // 将 timeStampLock 转换为时间格式
        const timeStampDate = new Date(timeStampLock * 1000); // 将时间戳转换为毫秒
        // 格式化时间
        const formattedTime = `${timeStampDate.getFullYear()}年${timeStampDate.getMonth() + 1}月${timeStampDate.getDate()}日 ${timeStampDate.getHours()}:${timeStampDate.getMinutes()}`;
        logger.info(`读取数据成功，数据更新时间为 ${formattedTime}`);
      } catch (error) {
        logger.error(`读取数据异常`)
      }
      return "ok"
    })

  }

  /**
   * 读取文件数据，存入jsonDate
   * @param str
   */
  readBaseFile () {
    fs.readFile(`${this._path}/data/resonanceBase.json`, 'utf8', (err, data) => {
      if (err) {
        logger.error(err);
        return;
      }
      try {
        baseData = JSON.parse(data);
      } catch (error) {
        logger.error(`读取基准数据异常`)
      }
    })

  }

}

function urlEncode (str) {
  return encodeURIComponent(str);
}
