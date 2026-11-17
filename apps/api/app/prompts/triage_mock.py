"""Canned replies for mock mode (no LLM key). Static data: long lines are fine."""

# ruff: noqa: E501

from app.schemas import Category, Language

MOCK_BODY: dict[Category, dict[Language, str]] = {
    Category.billing: {
        Language.en: "We are looking into your billing question; our team will check the charges on your account.",
        Language.bn: "আপনার বিলিং বিষয়টি আমরা দেখছি, আমাদের টিম আপনার অ্যাকাউন্টের চার্জগুলো যাচাই করবে।",
        Language.banglish: "Apnar billing bishoyti amra dekhchi, amader team account-er charge gulo check korbe.",
    },
    Category.outage: {
        Language.en: "We are sorry about the outage. Please keep your router powered on while our team checks the line.",
        Language.bn: "সংযোগ বিচ্ছিন্ন থাকার জন্য আমরা দুঃখিত। আমাদের টিম লাইন পরীক্ষা করার সময় রাউটার চালু রাখুন।",
        Language.banglish: "Connection na thakar jonno amra dukkhito. Team line check korar shomoy router chalu rakhun.",
    },
    Category.technical: {
        Language.en: "Please restart your router and test the speed on a wired connection; details are in the guide.",
        Language.bn: "অনুগ্রহ করে রাউটারটি রিস্টার্ট করুন এবং তারযুক্ত সংযোগে স্পিড পরীক্ষা করুন; বিস্তারিত গাইডে আছে।",
        Language.banglish: "Router restart kore wired connection-e speed test korun; details guide-e ache.",
    },
    Category.plan_change: {
        Language.en: "Plan changes are handled by our support team; they will confirm the details and timing with you.",
        Language.bn: "প্ল্যান পরিবর্তন আমাদের সাপোর্ট টিম করে থাকে; তারা বিস্তারিত ও সময় আপনাকে জানাবে।",
        Language.banglish: "Plan change amader support team kore; tara details ar shomoy apnake janabe.",
    },
    Category.account_security: {
        Language.en: "Your account security comes first. Please do not share any OTP; a security agent will contact you.",
        Language.bn: "আপনার অ্যাকাউন্টের নিরাপত্তা সবার আগে। কাউকে ওটিপি দেবেন না; একজন এজেন্ট যোগাযোগ করবেন।",
        Language.banglish: "Apnar account-er security shobar age. Kauke OTP debenna; ekjon agent jogajog korben.",
    },
    Category.cancellation: {
        Language.en: "We are sorry to see you go. Our team will explain the cancellation steps and the router return.",
        Language.bn: "আপনাকে হারাতে হচ্ছে বলে আমরা দুঃখিত। আমাদের টিম বাতিলের ধাপ ও রাউটার ফেরতের নিয়ম জানাবে।",
        Language.banglish: "Apnake harate hocche bole amra dukkhito. Team cancellation step ar router return-er niyom janabe.",
    },
    Category.other: {
        Language.en: "This looks outside what LumaNet Fiber support covers, but an agent can point you further.",
        Language.bn: "বিষয়টি LumaNet Fiber সাপোর্টের আওতার বাইরে মনে হচ্ছে, তবে একজন এজেন্ট আপনাকে দিকনির্দেশ দিতে পারবেন।",
        Language.banglish: "Bishoyti LumaNet Fiber support-er baire mone hocche, tobe ekjon agent apnake dik-nirdesh dite parbe.",
    },
}
MOCK_INTRO = {
    Language.en: "Thank you for contacting LumaNet Fiber.",
    Language.bn: "LumaNet Fiber-এ যোগাযোগ করার জন্য ধন্যবাদ।",
    Language.banglish: "LumaNet Fiber-e jogajog korar jonno dhonnobad.",
}
