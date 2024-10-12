const line = require('@line/bot-sdk');
const express = require('express');
const dotenv = require('dotenv');

const env = dotenv.config().parsed;
const app = express();

const lineConfig = {
    channelAccessToken: env.ACCESS_TOKEN,
    channelSecret: env.SECRET_TOKEN
};

const client = new line.Client(lineConfig);

// รายการไส้แซนด์วิชที่มีให้เลือก
const ingredients = ["ไข่ข้น", "แฮม", "ไส้กรอก", "ปูอัด", "ทูน่า", "โบโลน่า", "ชีส", "ไข่ดาว"];

// คำสำคัญสำหรับการตรวจจับเงื่อนไขต่างๆ
const exclusionTerms = [
    "ไม่ใส่ผัก", "ไม่เอาผักกาด", "ไม่เอาแครอท", "ไม่ผัก",
    "ไม่ซอส", "ไม่ผักกาด", "ไม่แครอท", "ไม่ซอสมะเขือเทศ",
    "ไม่ซอสมะยองเนส", "ไม่มะยองเนส", "ไม่มะเขือเทศ"
];
const inclusionTerms = ["เอาแค่ผักกาด", "เอาแค่แครอท"];

// ฟังก์ชันสำหรับแก้ไขคำสะกดผิด
function correctSpelling(text) {
    const corrections = {
        "แชนวิช": "แซนวิช",
        "ซฮย": "ซอย",
        "แครอช": "แครอท",
        "ผักกาด": "ผัก" // รวมผักกาดเป็นผักในเงื่อนไขไม่ใส่ผัก
    };
    for (let [wrong, correct] of Object.entries(corrections)) {
        const regex = new RegExp(wrong, 'g');
        text = text.replace(regex, correct);
    }
    return text;
}

// ฟังก์ชันสำหรับคำนวณราคา
function calculatePrice(numberOfFilling, quantity) {
    let price = 0;
    if (numberOfFilling === 2) price = 39;
    else if (numberOfFilling === 3) price = 45;
    else if (numberOfFilling === 4) price = 55;
    return price * quantity; // คูณด้วยจำนวนแซนวิช
}

// ฟังก์ชันสำหรับแยกข้อมูลจากข้อความการสั่ง
function extractOrderDetails(order) {
    // แก้ไขคำสะกดผิดก่อน
    order = correctSpelling(order);

    let deliveryTime = '';
    let address = '';
    let orders = [];

    // ตรวจจับเวลาส่ง
    const timeMatch = order.match(/(\d{1,2}[:.]\d{2})/);
    if (timeMatch) {
        deliveryTime = timeMatch[1];
    }

    // ตรวจจับที่อยู่
    const addressMatch = order.match(/(บ้าน\s*\d+\/?\d*\s*ซอย\s*\d+|ซอย\s*\d+\s*บ้าน\s*\d+\/?\d*|\d+\/?\d*\s*ซ\.?\s*\d+|บ้าน\s*\d+\/?\d*|ซ\.?\d+)/);
    if (addressMatch) {
        const houseMatch = addressMatch[0].match(/\d+\/?\d*/);
        const soiMatch = addressMatch[0].match(/ซ\.?\s*(\d+)/);

        if (houseMatch && soiMatch) {
            const houseNumber = houseMatch[0];
            const soiNumber = soiMatch[1];
            address = `${houseNumber} ซ.${soiNumber}`;
        } else if (houseMatch) {
            const houseNumber = houseMatch[0];
            address = `${houseNumber}`;
        } else if (soiMatch) {
            const soiNumber = soiMatch[1];
            address = `ซ.${soiNumber}`;
        }
    }

    // แยกออเดอร์ออกจากบรรทัดที่มีตัวเลข
    const orderLines = order.split('\n').filter(line => line.trim().length > 0);
    let orderIndex = 1;

    orderLines.forEach((line) => {
        let selected = [];
        let exclusionText = '';

        // ตรวจจับส่วนผสมแซนด์วิช
        ingredients.forEach(filling => {
            if (line.includes(filling)) {
                selected.push(filling);
            }
        });

        // ตรวจจับเงื่อนไขพิเศษ เช่น "ไม่เอาผักกาด" และ "เอาแค่ผักกาด"
        exclusionTerms.forEach(term => {
            if (line.includes(term)) {
                exclusionText = `(${term})`;
            }
        });

        inclusionTerms.forEach(term => {
            if (line.includes(term)) {
                exclusionText = `(${term})`;
            }
        });

        // ตรวจจับจำนวนแซนวิชในแต่ละออเดอร์
        const quantityMatch = line.match(/(\d+)$/);
        const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

        // ถ้าเจอส่วนผสม ให้บันทึกออเดอร์พร้อมจำนวนและเงื่อนไข
        if (selected.length > 0) {
            orders.push({
                filling1: selected[0] || '',
                filling2: selected[1] || '',
                filling3: selected[2] || '',
                filling4: selected[3] || '',
                quantity: quantity,
                exclusionText: exclusionText // เพิ่มข้อความเงื่อนไข
            });
            orderIndex++;
        }
    });

    return {
        orders,
        deliveryTime,
        address
    };
}

// ฟังก์ชันสำหรับจัดการ event ที่มาจาก LINE Webhook
// ฟังก์ชันสำหรับจัดการ event ที่มาจาก LINE Webhook
const handleEvent = async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    const userMessage = event.message.text;

    let totalPrice = 0; // ประกาศ totalPrice
    let totalPriceFinal = totalPrice; // ประกาศ totalPriceFinal

    const profile = await client.getProfile(event.source.userId);
    const userName = profile.displayName;
    const currentTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const result = extractOrderDetails(userMessage);

    if (userMessage === 'ยืนยัน') {
        totalPriceFinal = totalPrice; // กำหนดค่า totalPriceFinal ให้มีค่าเท่ากับ totalPrice

        // สร้างข้อความ Flex เพื่อแจ้งยอดชำระทั้งหมด
        const paymentMessage = {
            type: 'flex',
            altText: 'ยอดชำระทั้งหมด',
            contents: {
                type: 'bubble',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: `คุณ ${userName}`,
                            weight: 'bold',
                            size: 'lg'
                        },
                        {
                            type: 'text',
                            text: `เวลา: ${currentTime}`,
                            size: 'sm',
                            color: '#888888',
                            margin: 'md'
                        },
                        {
                            type: 'separator',
                            margin: 'md'
                        },
                        {
                            type: 'text',
                            text: `ยอดชำระทั้งหมด: ${totalPriceFinal} บาท`, // ใช้ totalPriceFinal ที่นี่
                            weight: 'bold',
                            size: 'lg',
                            margin: 'lg'
                        }
                    ]
                }
            }
        };

        await client.replyMessage(event.replyToken, paymentMessage);
        return;
    }

    if (result.orders.length === 0) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่พบรายการสั่งแซนด์วิช' });
        return;
    }

    const orderList = result.orders.map((order, index) => ({
        index: index + 1,
        filling1: order.filling1,
        filling2: order.filling2,
        filling3: order.filling3,
        filling4: order.filling4,
        quantity: order.quantity
    }));

    console.log(orderList); // แสดงผลข้อมูลรายการสั่งซื้อใน console

    const orderContents = result.orders.map((order, index) => {
        const itemPrice = calculatePrice(
            [order.filling1, order.filling2, order.filling3, order.filling4].filter(f => f).length,
            order.quantity
        );

        totalPrice += itemPrice; // เพิ่มราคาสินค้าไปยัง totalPrice

        return {
            type: 'box',
            layout: 'horizontal',
            contents: [
                {
                    type: 'text',
                    text: `ชิ้นที่ ${index + 1}: ${order.filling1} ${order.filling2} ${order.filling3} ${order.filling4} (${order.quantity}) ${order.exclusionText}`,
                    size: 'sm',
                    flex: 4,
                    wrap: true
                },
                {
                    type: 'text',
                    text: `${itemPrice} บาท`,
                    size: 'sm',
                    align: 'end',
                    color: '#888888',
                    flex: 2
                }
            ],
            margin: 'sm'
        };
    });

    totalPriceFinal = totalPrice; // สร้างตัวแปร totalPriceFinal ให้มีค่าเท่ากับ totalPrice

    const flexMessage = {
        type: 'flex',
        altText: 'ยอดชำระทั้งหมด',
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            {
                                type: 'text',
                                text: `คุณ ${userName}`,
                                weight: 'bold',
                                size: 'lg',
                                flex: 3
                            },
                            {
                                type: 'text',
                                text: `เวลา: ${currentTime}`,
                                size: 'sm',
                                align: 'end',
                                flex: 2,
                                color: '#888888'
                            }
                        ]
                    },
                    {
                        type: 'separator',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: `เวลาส่ง: ${result.deliveryTime}`,
                        size: 'sm',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: `ที่อยู่: ${result.address}`,
                        size: 'sm',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: 'รายการสั่งซื้อ:',
                        weight: 'bold',
                        size: 'lg',
                        margin: 'lg'
                    },
                    ...orderContents,
                    {
                        type: 'separator',
                        margin: 'lg'
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            {
                                type: 'text',
                                text: 'รวมทั้งหมด',
                                weight: 'bold',
                                size: 'sm',
                                flex: 4
                            },
                            {
                                type: 'text',
                                text: `${totalPriceFinal} บาท`, // ใช้ totalPriceFinal ที่นี่
                                size: 'sm',
                                align: 'end',
                                flex: 2
                            }
                        ],
                        margin: 'md'
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'horizontal',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        action: {
                            type: 'message',
                            label: 'ยืนยัน',
                            text: 'ยืนยัน'
                        },
                        color: '#00B900'
                    },
                    {
                        type: 'button',
                        style: 'primary',
                        action: {
                            type: 'message',
                            label: 'ยกเลิก',
                            text: 'ยกเลิก'
                        },
                        color: '#FF0000',
                        margin: 'md'
                    }
                ]
            }
        }
    };

    await client.replyMessage(event.replyToken, flexMessage);
};






// Route สำหรับ Webhook
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

app.listen(4000, () => {
    console.log('LINE Bot is running on port 4000');
});
