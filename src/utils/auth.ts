import jwt from "jsonwebtoken"

export const generateJWT = (UserID: string) => {
    const payload = {UserID: UserID}
    const secret = String(process.env.JWT_SECRET)
    const token = jwt.sign(payload, secret, {
        expiresIn: "15m"
    })
    return token
}