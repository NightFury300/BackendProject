import { Router } from "express";
import { registerUser,loginUser,logoutUser } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middlerware.js";
import { verifyJWTToken } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
    upload.fields([
        {
            name:"avatar",
            maxCount:1
        },
        {
            name:"coverImage",
            maxCount:1
        }
    ]),
    registerUser)
router.route("/login").post(loginUser)

//secured routes
router.route("/logout").post(verifyJWTToken,logoutUser)

export default router;