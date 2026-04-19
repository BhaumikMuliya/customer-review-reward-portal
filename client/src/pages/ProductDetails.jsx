import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Countbox, CustomButton, Loader } from "../components";
import { thirdweb } from "../assets";
import Web3 from "web3";
import axios from "axios";
import MoneyDistribution from "../abi/MoneyDistribution.json";
import { useStateAuth } from "../context/StateProvider";
import { toast } from "react-toastify";

function buildValidationPayload(questions, questionAnswers) {
  return questions
    .filter((q) => q.type === "short")
    .map((q) => ({
      question: q.q,
      answer: questionAnswers[q.q] ?? "",
    }));
}

function serializeReview(review, questions) {
  return JSON.stringify({
    name: review.name,
    orderId: review.orderId,
    description: review.description,
    questionAnswers: questions.map((q) => ({
      question: q.q,
      answer: review.questionAnswers[q.q] ?? "",
    })),
  });
}

const EMPTY_REVIEW = {
  name: "",
  orderId: "",
  description: "",
  attachments: [],
  questionAnswers: {},
};

const ProductDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userData } = useStateAuth();

  const product = location.state;

  const isSubmitting = useRef(false);

  const [contract, setContract] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [isOrderIdTracking, setIsOrderIdTracking] = useState(false);
  const [newReview, setNewReview] = useState(EMPTY_REVIEW);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [noQuestionsConfigured, setNoQuestionsConfigured] = useState(false);

  const productMissing = !product || !product.id;

  useEffect(() => {
    if (productMissing) return;

    let active = true;
    async function initWeb3() {
      try {
        const { ethereum } = window;
        if (!ethereum) return;
        const web3 = new Web3(ethereum);
        const networkId = await web3.eth.net.getId();
        const deployed = MoneyDistribution.networks[networkId];
        if (!deployed) return;
        const c = new web3.eth.Contract(
          MoneyDistribution.abi,
          deployed.address,
        );
        if (active) setContract(c);
      } catch (err) {
        console.error("Web3 init error:", err);
      }
    }
    initWeb3();
    return () => {
      active = false;
    };
  }, [productMissing]);

  const fetchQuestions = useCallback(async () => {
    if (!product?.id) return;
    setFetchError("");
    setNoQuestionsConfigured(false);
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/api/questions/${product.id}`,
      );
      setQuestions(res.data.questions ?? []);
      setIsOrderIdTracking(res.data.isOrderIdTracking ?? false);
    } catch (err) {
      if (err.response?.status === 404) {
        setNoQuestionsConfigured(true);
        setQuestions([]);
      } else {
        console.error("Questions fetch error:", err);
        setFetchError(
          "Could not load review questions. Please refresh the page.",
        );
      }
    }
  }, [product?.id]);

  useEffect(() => {
    if (userData && !productMissing) fetchQuestions();
  }, [userData, productMissing, fetchQuestions]);

  useEffect(() => {
    if (!isOrderIdTracking) {
      setNewReview((prev) => ({ ...prev, orderId: "", attachments: [] }));
    }
  }, [isOrderIdTracking]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewReview((prev) => ({ ...prev, [name]: value }));
  };

  const handleAnswerChange = (questionText, value) => {
    setNewReview((prev) => ({
      ...prev,
      questionAnswers: { ...prev.questionAnswers, [questionText]: value },
    }));
  };

  const handleAttachmentChange = (e) => {
    setNewReview((prev) => ({
      ...prev,
      attachments: Array.from(e.target.files),
    }));
  };

  const resetForm = () => {
    setNewReview(EMPTY_REVIEW);
    setSubmitSuccess(false);
  };

  const submitOnChain = async (orderId, serializedReview) => {
    if (!contract) throw new Error("Smart contract not initialized.");
    const { ethereum } = window;
    if (!ethereum) throw new Error("MetaMask is not installed.");

    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const tx = await contract.methods
      .NewReview(orderId, product.id, serializedReview)
      .send({ from: accounts[0] });

    return tx;
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const validationPayload = buildValidationPayload(
      questions,
      newReview.questionAnswers,
    );
    const serialized = serializeReview(newReview, questions);

    setIsValidating(true);
    try {
      if (validationPayload.length > 0) {
        const res = await axios.post("http://localhost:8000/validate-answer2", {
          qna: validationPayload,
        });

        const parts = (res.data?.validation ?? "").split(" ,,,, ");
        const failed = parts.some((r) => r.trim() === "no");

        if (failed) {
          toast.error(
            "One or more answers did not pass our quality check. Please review and try again.",
          );
          return;
        }
      }
    } catch (err) {
      console.error("Validation service error:", err);
      toast.error(
        "The answer validation service is currently unavailable. Please try again shortly.",
      );
      return;
    } finally {
      setIsValidating(false);
    }

    setIsLoading(true);
    try {
      const moneyRes = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/api/customers/sendmoney`,
        { key: userData.pkey },
      );

      if (moneyRes.data?.status !== true) {
        toast.error(
          "Payment could not be authorised. Please check your account balance and try again.",
        );
        return;
      }
    } catch (err) {
      console.error("sendmoney error:", err);
      const message =
        err.response?.data?.message ??
        "A server error occurred during payment. Please try again.";
      toast.error(message);
      return;
    }

    try {
      const orderId = isOrderIdTracking
        ? newReview.orderId.trim() || "null"
        : "null";

      const tx = await submitOnChain(orderId, serialized);

      const contractMsg = tx?.events?.event1?.returnValues?.[0];
      toast.success(contractMsg ?? "Review submitted successfully!");

      setSubmitSuccess(true);
      setNewReview(EMPTY_REVIEW);
    } catch (err) {
      console.error("Blockchain tx error:", err);
      if (err?.code === 4001) {
        toast.warn("Transaction was cancelled in MetaMask.");
      } else {
        toast.error(
          "Blockchain submission failed. Your payment may already have been processed — contact support if needed.",
        );
      }
    } finally {
      setIsLoading(false);
      isSubmitting.current = false;
    }
  };

  if (productMissing) {
    return (
      <div className="flex flex-col items-center justify-center mt-20 gap-6">
        <div className="bg-[#1c1c24] p-8 rounded-[10px] text-center max-w-md">
          <p className="font-epilogue font-semibold text-[18px] text-[#808191] mb-4">
            No product data found.
          </p>
          <p className="font-epilogue text-[14px] text-[#4b5264] mb-6">
            Please navigate here from the Marketplace — direct URL access is not
            supported.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="bg-[#8c6dfd] text-white px-6 py-2 rounded-[10px] font-epilogue hover:bg-[#00cec9] transition duration-300"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {isLoading && <Loader />}

      <div className="w-full flex md:flex-row flex-col mt-10 gap-[30px]">
        <div className="flex-1 flex-col">
          <img
            src={product.prodimg}
            alt="Product"
            className="w-full h-[410px] object-cover rounded-xl"
          />
          <div className="relative w-full h-[5px] bg-[#3a3a43] mt-2" />
        </div>

        <div className="flex md:w-1/2 flex-wrap justify-between gap-[20px]">
          <Countbox
            title="Price"
            value={`${(Number(product.amt) / 1e18).toFixed(4)} AVAX`}
          />
          <Countbox title="Reviews" value={product.reviewCount ?? 0} />
          <Countbox title="Min Reviews" value={product.min_review_count ?? 0} />

          <div>
            <h4 className="font-epilogue font-semibold text-[18px] text-white mt-8">
              Product Details
            </h4>

            <div className="mt-[20px] flex flex-row items-center flex-wrap gap-[14px]">
              <div className="w-[52px] h-[52px] flex items-center justify-center rounded-full bg-[#2c2f32]">
                <img
                  src={thirdweb}
                  alt="company"
                  className="w-[60%] h-[60%] object-contain"
                />
              </div>
              <div>
                <h4 className="font-epilogue font-semibold text-[14px] text-white break-all">
                  {product.name}
                </h4>
                <p className="mt-[4px] font-epilogue font-medium text-[12px] text-[#808191]">
                  {product.company_name}
                </p>
              </div>
            </div>

            <h4 className="font-epilogue font-semibold text-[18px] text-white mt-8">
              Description
            </h4>
            <div className="mt-[20px] font-epilogue font-normal text-[16px] text-[#808191] leading-[26px] text-justify">
              <p>{product.prod_Details}</p>
              <p className="mt-2">
                Status: <span className="text-white">{product.status}</span>
              </p>
              <p>
                Next Reward:{" "}
                <span className="text-white">
                  {product.nextAmount
                    ? `${(Number(product.nextAmount) / 1e18).toFixed(4)} AVAX`
                    : "—"}
                </span>
              </p>
              <p className="break-all">
                Owner: <span className="text-[#4b5264]">{product.owner}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[60px] flex lg:flex-row flex-col gap-5">
        <div className="flex-1 flex flex-col gap-[40px]">
          <div>
            <h4 className="font-epilogue font-semibold text-[18px] text-white">
              Reviews
            </h4>
            <div className="mt-[20px]">
              <p className="font-epilogue font-normal text-[16px] text-[#808191] leading-[26px]">
                No reviews yet. Be the first one!
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <h4 className="font-epilogue font-semibold text-[18px] text-white uppercase">
            Feedback
          </h4>

          <div className="mt-8 flex flex-col p-4 bg-[#1c1c24] rounded-[10px]">
            {fetchError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-[8px] p-3 mb-4">
                <p className="font-epilogue text-[13px] text-red-400">
                  {fetchError}
                </p>
                <button
                  type="button"
                  onClick={fetchQuestions}
                  className="mt-2 text-[12px] text-[#8c6dfd] underline font-epilogue"
                >
                  Retry
                </button>
              </div>
            )}

            {noQuestionsConfigured && (
              <div className="bg-[#13131a] border border-[#2c2f32] rounded-[8px] p-3 mb-4 flex items-start gap-3">
                <span className="text-[#808191] text-[18px] mt-0.5">ℹ️</span>
                <div>
                  <p className="font-epilogue font-semibold text-[13px] text-[#808191]">
                    No custom questions for this product yet.
                  </p>
                  <p className="font-epilogue text-[12px] text-[#4b5264] mt-1">
                    You can still submit your general review below.
                  </p>
                </div>
              </div>
            )}

            {submitSuccess ? (
              <div className="flex flex-col items-center gap-4 py-10">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <span className="text-green-400 text-3xl">✓</span>
                </div>
                <p className="font-epilogue font-semibold text-[18px] text-green-400">
                  Review Submitted!
                </p>
                <p className="font-epilogue text-[14px] text-[#808191] text-center max-w-xs">
                  Thank you for your feedback. Your reward will be distributed
                  after verification.
                </p>
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-[#8c6dfd] text-white px-6 py-2 rounded-[10px] font-epilogue hover:bg-[#00cec9] transition duration-300"
                >
                  Submit Another Review
                </button>
              </div>
            ) : (
              <>
                <p className="font-epilogue font-medium text-[20px] leading-[30px] text-center text-[#808191]">
                  Review the Product
                </p>

                <form onSubmit={handleReviewSubmit} className="mt-4">
                  <input
                    required
                    name="name"
                    type="text"
                    placeholder="Your name..."
                    className="w-full py-2 my-2 sm:px-[20px] px-[15px] outline-none border-[1px] border-[#3a3a43] bg-transparent font-epilogue text-white text-[18px] leading-[30px] placeholder:text-[#4b5264] rounded-[10px]"
                    value={newReview.name}
                    onChange={handleInputChange}
                  />

                  {isOrderIdTracking && (
                    <>
                      <input
                        required
                        name="orderId"
                        type="text"
                        placeholder="Order ID..."
                        className="w-full py-2 my-2 sm:px-[20px] px-[15px] outline-none border-[1px] border-[#3a3a43] bg-transparent font-epilogue text-white text-[18px] leading-[30px] placeholder:text-[#4b5264] rounded-[10px]"
                        value={newReview.orderId}
                        onChange={handleInputChange}
                      />
                      <input
                        type="file"
                        name="attachments"
                        className="w-full py-3 my-2 sm:px-[20px] px-[15px] outline-none border-[1px] border-[#3a3a43] bg-transparent font-epilogue text-[#4b5264] leading-[30px] rounded-[10px]"
                        onChange={handleAttachmentChange}
                      />
                    </>
                  )}

                  <textarea
                    required
                    id="description"
                    name="description"
                    rows={4}
                    placeholder="Write a detailed review..."
                    className="w-full py-2 my-2 sm:px-[20px] px-[15px] outline-none border-[1px] border-[#3a3a43] bg-transparent font-epilogue text-white text-[18px] leading-[30px] placeholder:text-[#4b5264] rounded-[10px]"
                    value={newReview.description}
                    onChange={handleInputChange}
                  />

                  <div className="my-[20px] p-4 bg-[#13131a] rounded-[10px]">
                    <h4 className="font-epilogue font-semibold text-[14px] leading-[22px] text-white">
                      Back it because you believe in it.
                    </h4>
                    <p className="mt-2 font-epilogue font-normal leading-[22px] text-[#808191]">
                      Support the product because it speaks to you.
                    </p>
                  </div>

                  {questions.map((question, index) => (
                    <div key={question.q ?? index} className="my-4">
                      <label
                        htmlFor={`q-${index}`}
                        className="font-epilogue font-semibold text-[16px] text-white"
                      >
                        {question.q}
                      </label>

                      {question.type === "short" ? (
                        <textarea
                          id={`q-${index}`}
                          rows={2}
                          placeholder="Your answer..."
                          className="w-full py-2 my-2 sm:px-[20px] px-[15px] outline-none border-[1px] border-[#3a3a43] bg-transparent font-epilogue text-white text-[18px] leading-[30px] placeholder:text-[#4b5264] rounded-[10px]"
                          value={newReview.questionAnswers[question.q] ?? ""}
                          onChange={(e) =>
                            handleAnswerChange(question.q, e.target.value)
                          }
                        />
                      ) : (
                        (question.options ?? []).map((option, oIdx) => (
                          <div key={oIdx} className="flex items-center my-2">
                            <input
                              type="radio"
                              id={`q-${index}-o-${oIdx}`}
                              name={`q-${index}`}
                              value={option}
                              className="mr-2"
                              checked={
                                newReview.questionAnswers[question.q] === option
                              }
                              onChange={(e) =>
                                handleAnswerChange(question.q, e.target.value)
                              }
                            />
                            <label
                              htmlFor={`q-${index}-o-${oIdx}`}
                              className="font-epilogue font-normal text-[16px] text-white"
                            >
                              {option}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  ))}

                  <CustomButton
                    btnType="submit"
                    title={
                      isValidating
                        ? "Validating answers…"
                        : isLoading
                          ? "Submitting…"
                          : "Submit Review"
                    }
                    styles={`w-full transition duration-500 ${
                      isValidating || isLoading
                        ? "bg-[#3a3a43] cursor-not-allowed opacity-60"
                        : "bg-[#8c6dfd] hover:bg-[#00cec9]"
                    }`}
                    disabled={isValidating || isLoading}
                  />

                  {(isValidating || isLoading) && (
                    <p className="mt-2 text-center font-epilogue text-[13px] text-[#808191] animate-pulse">
                      {isValidating
                        ? "Checking your answers for quality…"
                        : "Processing — please keep this page open…"}
                    </p>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
