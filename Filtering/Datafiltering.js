// รายการไส้แซนด์วิชที่มีให้เลือก
const ingredients = ["ไข่ดาว", "ไข่ข้น", "แฮม", "ไส้กรอก", "ปูอัด", "ทูน่า", "โบโลน่า", "ชีส", "ไข่"];

// ฟังก์ชันสำหรับแยกข้อมูลจากข้อความการสั่ง
function extractOrderDetails(order) {
    let address = '';
    let deliveryTime = '';
    let selected = [];

    // ตรวจจับเวลาส่ง
    const timeMatch = order.match(/(\d{1,2}[:.]\d{2})/);
    if (timeMatch) {
        deliveryTime = timeMatch[1];
    }

    // ตรวจจับที่อยู่
    const addressMatch = order.match(/บ้าน\s*(\d+[\s\S]*\d+)/);
    if (addressMatch) {
        address = addressMatch[1].trim();
    }

    // ตรวจสอบไส้แซนด์วิชที่เลือก
    ingredients.forEach(filling => {
        if (order.includes(filling)) {
            selected.push(filling);
        }
    });

    // ตรวจสอบจำนวนไส้ที่เลือก
    if (selected.length >= 2 && selected.length <= 4) {
        return {
            status: "success",
            message: `ไส้ที่เลือก: ${selected.join(", ")}`,
            address: address ? `ที่อยู่: ${address}` : "ไม่มีข้อมูลที่อยู่",
            deliveryTime: deliveryTime ? `เวลาส่ง: ${deliveryTime}` : "ไม่มีข้อมูลเวลาส่ง"
        };
    } else {
        return {
            status: "error",
            message: `กรุณาเลือกไส้ 2-4 ไส้ (คุณเลือก ${selected.length} ไส้)`,
            address: address ? `ที่อยู่: ${address}` : "ไม่มีข้อมูลที่อยู่",
            deliveryTime: deliveryTime ? `เวลาส่ง: ${deliveryTime}` : "ไม่มีข้อมูลเวลาส่ง"
        };
    }
}

// ตัวอย่างข้อความการสั่งจากผู้ใช้
let userOrder = "แซนวิชปกติ แฮมไส้กรอก ไข่ข้น แซนวิชมินิ ปูอัด ไข่ข้น ส่งพรุ่งนี้เช้า 7.30 น. ค่ะ บ้าน 171 ช.19";

// ประมวลผลคำสั่ง
let result = extractOrderDetails(userOrder);

// แสดงผลลัพธ์
console.log(result.message);
console.log(result.address);
console.log(result.deliveryTime);
