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
const exclusionTerms = ["ไม่ใส่ผัก", "ไม่เอาผักกาด", "ไม่เอาแครอท", "ไม่ผัก", "ไม่ซอส", "ไม่ผักกาด", "ไม่แครอท", "ไม่ซอสมะเขือเทศ", "ไม่ซอสมะยองเนส", "ไม่มะยองเนส", "ไม่มะเขือเทศ"];
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
function calculatePrice(numberOfFilling) {
    if (numberOfFilling === 2) return 39;
    if (numberOfFilling === 3) return 45;
    if (numberOfFilling >= 4) return 55;
    return 0; // ถ้าไม่มีไส้ ไม่คิดเงิน
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

        // ตรวจจับเงื่อนไขพิเศษ เช่น "ไม่เอาผักกาด"
        exclusionTerms.forEach(term => {
            if (line.includes(term)) {
                exclusionText = ` (${term})`;
            }
        });

        inclusionTerms.forEach(term => {
            if (line.includes(term)) {
                exclusionText = ` (${term})`;
            }
        });

        // ตรวจจับจำนวนแซนวิชในแต่ละออเดอร์
        const quantityMatch = line.match(/(\d+)$/);
        const quantity = quantityMatch ? quantityMatch[1] : '1';

        // ถ้าเจอส่วนผสม ให้บันทึกออเดอร์พร้อมจำนวนและเงื่อนไข
        if (selected.length > 0) {
            const price = calculatePrice(selected.length) * quantity;
            orders.push({
                detail: `ออเดอร์ ${orderIndex} : ${selected.sort().join(" ")} ${quantity}${exclusionText}`,
                price: price
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
const handleEvent = async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    const userMessage = event.message.text;
    const result = extractOrderDetails(userMessage);

    // ดึงข้อมูลผู้ใช้งานจาก LINE
    const profile = await client.getProfile(event.source.userId);
    const userName = profile.displayName;

    // ดึงเวลาปัจจุบัน
    const currentTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    let totalPrice = 0;

    // ตรวจสอบว่ามีรายการสั่งซื้อหรือไม่
    if (result.orders.length === 0) {
        await client.replyMessage(event.replyToken, { type: 'text', text: 'ไม่พบรายการสั่งแซนด์วิช' });
        return;
    }

    // สร้างรายการ order ใน Flex Message
    const orderContents = result.orders.map((order, index) => {
        totalPrice += order.price;
        return {
            type: 'box',
            layout: 'horizontal',
            contents: [
                {
                    type: 'text',
                    text: `${order.detail}`,
                    size: 'sm',
                    flex: 4,
                    wrap: true
                },
                {
                    type: 'text',
                    text: `${order.price} บาท`,
                    size: 'sm',
                    align: 'end',
                    color: '#888888',
                    flex: 2
                }
            ],
            margin: 'sm'
        };
    });

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
                        type: 'text',
                        text: `คุณ ${userName}`,
                        weight: 'bold',
                        size: 'lg'
                    },
                    {
                        type: 'text',
                        text: `เวลา: ${currentTime}`,
                        size: 'sm',
                        color: '#999999',
                        margin: 'md'
                    },
                    {
                        type: 'separator',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: 'รายละเอียดการสั่งซื้อ',
                        weight: 'bold',
                        size: 'md',
                        margin: 'md'
                    },
                    ...orderContents,
                    {
                        type: 'separator',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: 'ยอดชำระทั้งหมด',
                        weight: 'bold',
                        size: 'lg',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: `${totalPrice} บาท`,
                        size: 'xxl',
                        weight: 'bold',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: `เวลาในการส่ง: ${result.deliveryTime}`,
                        size: 'md',
                        margin: 'md'
                    },
                    {
                        type: 'text',
                        text: `ที่อยู่: ${result.address}`,
                        size: 'md',
                        margin: 'md'
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'md',
                        spacing: 'sm',
                        contents: [
                            {
                                type: 'button',
                                style: 'primary',
                                action: {
                                    type: 'postback',
                                    label: 'เงินสด',
                                    data: `payment=cash`
                                }
                            },
                            {
                                type: 'button',
                                style: 'primary',
                                action: {
                                    type: 'postback',
                                    label: 'โอนจ่าย',
                                    data: `payment=transfer`
                                }
                            }
                        ]
                    }
                ]
            }
        }
    };

    await client.replyMessage(event.replyToken, [
        { type: 'text', text: `รายละเอียดคำสั่งซื้อ:\n${result.orders.map(order => order.detail).join('\n')}` },
        flexMessage
    ]);
};

// ฟังก์ชันสำหรับจัดการการเลือกวิธีการชำระเงิน
const handlePaymentSelection = async (event) => {
    const selectedPayment = event.postback.data.split('=')[1];
    let replyText = `คุณเลือกวิธีการชำระเงิน: ${selectedPayment === 'cash' ? 'เงินสด' : 'โอนจ่าย'}`;
    await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
};

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
    try {
        const events = req.body.events;
        if (events.length > 0) {
            const promises = events.map(async (event) => {
                if (event.type === 'postback') {
                    await handlePaymentSelection(event);
                } else {
                    await handleEvent(event);
                }
            });
            await Promise.all(promises);
        }
        res.status(200).end();
    } catch (error) {
        console.error(error);
        res.status(500).end();
    }
});

app.listen(4000, () => {
    console.log('LINE webhook server is running on port 4000');
});
