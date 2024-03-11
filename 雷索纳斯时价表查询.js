import plugin from '../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import fs from "node:fs"
import common from '../../lib/common/common.js'

let jsonData;
let baseData;
let resonanceKey = "Yz:resonance:outTime";
let urlVersion = "Yz:resonance:resourceVersion";
let timeStampLock;
let n = ["修格里城", "铁盟哨站", "七号自由港", "澄明数据中心", "阿妮塔战备工厂", "阿妮塔能源研究所", "荒原站", "曼德矿场", "淘金乐园"];
let urlV1="https://www.resonance-columba.com/api/get-prices";
let urlV2="https://www.resonance-columba.com/api/get-prices-v2";
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
        },
        {
          /** 命令正则匹配 */
          reg: '^#时价表更新(.*)$',
          /** 执行方法 */
          fnc: 'updateMarcket'
        }
      ]
    })
  }

  /**
   * 强制更新时价表
   * @param e
   * @returns {Promise<void>}
   */
  async updateMarcket (e) {
    let uVersion = e.msg.replace(/#|＃|时价表更新/g, "");
    if (uVersion==="1"){
      redis.set(urlVersion, "1");
      await common.sleep(1000)
    }else if (uVersion==="2"){
      redis.set(urlVersion, "2");
      await common.sleep(1000)
    }
    this._path = process.cwd()
    timeStampLock = await this.refreshMarcketFile();
  }
  /**
   * #时价表查询
   * @param e oicq传递的事件参数e
   */
  async resonanceMarcketSearch (e) {
    let emsg = e.msg.replace(/#|＃|时价表查询/g, "");
    let hasPlace=false;
    if (emsg){
      if (n.includes(emsg)){
        hasPlace=true;
      }else {
        this.reply("请填写正确的区域名")
        return;
      }
    }
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

    let result = [];
    //计算最佳路线
    if (hasPlace){
      let placeA=emsg;
      for (let p2 in n) {
        let placeB = n[p2];
        if (placeA !== placeB) {
          let tRevenue = this.calculateTotalProfit(placeA, placeB);
          result.push(tRevenue);
        }
      }
    }else {
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
      if (!nowChange){
        break ;
      }
      let sell = nowChange.sell;
      let buy = nowChange.buy;
      //排除制造产物
      if (nowPrice.type !== "Craft" && sell &&sell[placeB] &&buy && buy[placeA]) {
        let buyPrice = nowPrice.buyPrices[placeA];
        let sellPrice = nowPrice.sellPrices[placeB];
        let buyLot = nowPrice.buyLot[placeA];

        let changeA = buy[placeA].variation;
        let changeB = sell[placeB].variation;
        // (商品售出地基准价格x商品售出地价格浮动)×(100%-6%税+10%抬价幅度)-(商品购入地基准价格x商品购入地价格浮动)×(100%+6%税-14%砍价幅度)
        let thisTotalProduct = Math.floor(sellPrice * changeB / 100 - buyPrice * changeA / 100 );
        //logger.info(placeA + changeA + " " + placeB + changeB + " " + name +"单个收益" + thisTotalProduct + " 收益" + thisTotalProduct * buyLot)
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
    var urlV = await redis.get(urlVersion);
    if (urlV==="2"){
      urlV=urlV2;
    }else {
      urlV=urlV1;
    }
    var selectedCities = {
      "sourceCities": ["铁盟哨站", "修格里城", "澄明数据中心", "七号自由港", "阿妮塔能源研究所", "阿妮塔战备工厂", "荒原站", "曼德矿场", "淘金乐园"],
      "targetCities": ["铁盟哨站", "修格里城", "澄明数据中心", "七号自由港", "阿妮塔能源研究所", "阿妮塔战备工厂", "荒原站", "曼德矿场", "淘金乐园"]
    };
    var formattedString = JSON.stringify(selectedCities, null, 4);
    myHeaders.append("Cookie", urlEncode(formattedString));
    var requestOptions = {
      method: 'GET',
      headers: myHeaders,
      redirect: 'follow'
    };

    await fetch(urlV, requestOptions)
        .then(response => response.text())
        .then(result => {
          fs.writeFile(`${this._path}/data/resonanceMarcket.json`, result, (err) => {
            if (err) throw err;
            timeStampLock = Math.floor(Date.now() / 1000); // 获取当前时间戳（单位：秒）
            redis.set(resonanceKey, timeStampLock, { EX: 3600 });//采集信息有效期 1小时
            this.reply(`更新数据文件成功`)
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
