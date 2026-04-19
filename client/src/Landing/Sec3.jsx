import Side2 from "../assets/side1.png";
import "./Sec3.css";
const Sec3 = () => {
  return (
    <div className="sec2">
      <h1 className="sec2head">Wanna know the features?</h1>
      <div className="sec3out">
        <div className="sec3left">
          <div className="container2 main3">
            <div className="card2">
              <div className="face2 back2">
                <div className="content2">
                  <span className="stars2"></span>
                  <b className="desc2">Its simple:</b>
                  <div className="desc2">
                    <ul>
                      <li>Sign up</li>
                      <li>Choose a plan</li>
                      <li>Get your own AI assistant</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="face2 front2">
                <b>Whats all the </b>
                <b>Hype about?</b>
              </div>
            </div>
          </div>
        </div>
        <div className="sec3right">
          <img src={Side2} />
        </div>
      </div>
    </div>
  );
};

export default Sec3;
